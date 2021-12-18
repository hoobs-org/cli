/**************************************************************************************************
 * hoobs-cli                                                                                      *
 * Copyright (C) 2020 HOOBS                                                                       *
 *                                                                                                *
 * This program is free software: you can redistribute it and/or modify                           *
 * it under the terms of the GNU General Public License as published by                           *
 * the Free Software Foundation, either version 3 of the License, or                              *
 * (at your option) any later version.                                                            *
 *                                                                                                *
 * This program is distributed in the hope that it will be useful,                                *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of                                 *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the                                  *
 * GNU General Public License for more details.                                                   *
 *                                                                                                *
 * You should have received a copy of the GNU General Public License                              *
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.                          *
 **************************************************************************************************/

import Request from "axios";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync, readFileSync } from "fs-extra";

import {
    uuid,
    Bridge,
    Accessory,
    Service,
    Characteristic,
    AccessoryLoader,
} from "hap-nodejs";

import State from "../state";
import Paths from "../system/paths";
import Config from "../config";
import { Console } from "../logger";

export default class Plugins {
    static get directory(): string {
        return join(Paths.data(State.id), "node_modules");
    }

    static installed(bridge?: string): { [key: string]: any }[] {
        const results: { [key: string]: any }[] = [];

        Plugins.load(bridge || State.id, (name, scope, directory, pjson) => {
            results.push({
                scope,
                name,
                version: pjson.version,
                directory,
            });
        });

        return results;
    }

    static load(bridge: string, callback: (name: string, scope: string, directory: string, pjson: { [key: string]: any }, library: string) => void): void {
        if (existsSync(join(Paths.data(bridge), "package.json"))) {
            const plugins = Object.keys(Paths.loadJson<any>(join(Paths.data(bridge), "package.json"), {}).dependencies || {});

            for (let i = 0; i < plugins.length; i += 1) {
                if (plugins[i] !== "hap-nodejs") {
                    const directory = join(Plugins.directory, plugins[i]);
                    const pjson = Plugins.loadPackage(directory);

                    if (existsSync(directory) && pjson) {
                        const identifier = pjson.name.split("/");
                        const name: string = identifier.shift() || "";
                        const scope: string = identifier.pop() || "";
                        const library: string = pjson.main || "./index.js";

                        callback(name, scope, directory, pjson, library);
                    }
                }
            }
        }
    }

    static linkLibs(): Promise<void> {
        return new Promise((resolve) => {
            if (!existsSync(join(Paths.data(State.id), "node_modules", "hap-nodejs"))) {
                const flags = [];

                flags.push("add");
                flags.push("--unsafe-perm");
                flags.push("--ignore-engines");
                flags.push("hap-nodejs");

                const proc = spawn(Paths.yarn, flags, {
                    cwd: Paths.data(State.id),
                    stdio: "ignore",
                });

                proc.on("close", () => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    static install(name: string, version?: string): Promise<void> {
        const tag = version || "latest";

        return new Promise((resolve, reject) => {
            Plugins.definition(name).then((definition) => {
                const flags = [];

                flags.push("add");
                flags.push("--unsafe-perm");
                flags.push("--ignore-engines");
                flags.push(`${name}@${tag}`);

                if ((definition || {}).sidecar) flags.push(definition?.sidecar);

                const proc = spawn(Paths.yarn, flags, {
                    cwd: Paths.data(State.id),
                    stdio: ["inherit", "inherit", "inherit"],
                });

                proc.on("close", async () => {
                    Plugins.linkLibs();

                    const path = join(Plugins.directory, name);

                    if ((definition || {}).sidecar) {
                        const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(State.id), "sidecars.json"), {});

                        sidecars[name] = definition?.sidecar;

                        Paths.saveJson(join(Paths.data(State.id), "sidecars.json"), sidecars, true);
                    }

                    if (existsSync(path) && existsSync(join(path, "package.json"))) {
                        const pjson = Plugins.loadPackage(path);
                        const config = Config.configuration();

                        if (config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name) === -1) {
                            let found = false;
                            let alias = "";

                            const details: any[] = await Plugins.getPluginType(name, path, pjson) || [];

                            for (let i = 0; i < details.length; i += 1) {
                                if (details[i].type === "platform") {
                                    const index = config.platforms.findIndex((p: any) => p.platform === details[i].alias);

                                    if (index >= 0) {
                                        config.platforms[index].plugin_map = {
                                            plugin_name: name,
                                        };

                                        found = true;
                                    } else if (alias === "") {
                                        alias = details[i].alias;
                                    }
                                }
                            }

                            if (!found && alias !== "") {
                                config.platforms.push({
                                    platform: alias,
                                    plugin_map: {
                                        plugin_name: name,
                                    },
                                });
                            }
                        }

                        Config.saveConfig(config);

                        resolve();
                    } else {
                        reject();
                    }
                });
            });
        });
    }

    static uninstall(name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            Plugins.definition(name).then((definition) => {
                const flags = [];

                flags.push("remove");
                flags.push(name);

                if ((definition || {}).sidecar) {
                    flags.push(definition?.sidecar);
                }

                const proc = spawn(Paths.yarn, flags, {
                    cwd: Paths.data(State.id),
                    stdio: ["inherit", "inherit", "inherit"],
                });

                proc.on("close", () => {
                    if (!existsSync(join(Plugins.directory, name, "package.json"))) {
                        if ((definition || {}).sidecar) {
                            const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(State.id), "sidecars.json"), {});

                            delete sidecars[name];

                            Paths.saveJson(join(Paths.data(State.id), "sidecars.json"), sidecars, true);
                        }

                        const config = Config.configuration();
                        let index = config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name);

                        while (index >= 0) {
                            config.platforms.splice(index, 1);
                            index = config.platforms.findIndex((p: any) => (p.plugin_map || {}).plugin_name === name);
                        }

                        index = config.accessories.findIndex((a: any) => (a.plugin_map || {}).plugin_name === name);

                        while (index >= 0) {
                            config.accessories.splice(index, 1);
                            index = config.accessories.findIndex((a: any) => (a.plugin_map || {}).plugin_name === name);
                        }

                        Config.saveConfig(config);

                        resolve();
                    } else {
                        reject();
                    }
                });
            });
        });
    }

    static upgrade(name?: string, version?: string): Promise<void> {
        const tag = version || "latest";

        return new Promise((resolve) => {
            const flags: string[] = [];

            if (name) {
                flags.push("add");
                flags.push("--unsafe-perm");
                flags.push("--ignore-engines");
                flags.push(`${name}@${tag}`);

                Plugins.definition(name).then((definition) => {
                    if ((definition || {}).sidecar) {
                        flags.push(definition?.sidecar);
                    }

                    const proc = spawn(Paths.yarn, flags, {
                        cwd: Paths.data(State.id),
                        stdio: ["inherit", "inherit", "inherit"],
                    });

                    proc.on("close", () => {
                        if ((definition || {}).sidecar) {
                            const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(State.id), "sidecars.json"), {});

                            sidecars[name] = definition?.sidecar;

                            Paths.saveJson(join(Paths.data(State.id), "sidecars.json"), sidecars, true);
                        }

                        Config.touchConfig();

                        resolve();
                    });
                });
            } else {
                flags.push("upgrade");
                flags.push("--ignore-engines");
                flags.push("--network-timeout 100000");

                const proc = spawn(Paths.yarn, flags, {
                    cwd: Paths.data(State.id),
                    stdio: ["inherit", "inherit", "inherit"],
                });

                proc.on("close", () => {
                    Config.touchConfig();

                    resolve();
                });
            }
        });
    }

    static async getPluginType(name: string, path: string, pjson: any): Promise<any[]> {
        const registered: any[] = [];
        const schema = Plugins.loadSchema(path);

        if (schema) {
            const alias = schema.plugin_alias || schema.pluginAlias || name;

            let type = "platform";

            if (schema.pluginType === "accessory") type = "accessory";

            const idx = registered.findIndex((p) => p.alias === alias && p.type === type);

            if (idx === -1) registered.push({ name, alias, type });
        } else {
            let main = ((pjson || {}).main || "") !== "" ? join(name, pjson.main) : name;

            if (main.toLowerCase() === "index.js") main = name;
            if (main.toLowerCase().endsWith("/index.js")) main = main.replace(/\/index.js/gi, "");
            if (main.toLowerCase().endsWith(".js")) main = main.replace(/.js/gi, "");

            try {
                const plugin = await import(join(Plugins.directory, main));

                const options = {
                    hap: {
                        uuid,
                        Bridge,
                        Accessory,
                        Service,
                        Characteristic,
                        AccessoryLoader,
                    },
                    platformAccessory: {},
                    version: 2.4,
                    serverVersion: State.version,

                    registerPlatform: (_p: string, a: string) => {
                        const idx = registered.findIndex((p) => p.alias === a && p.type === "platform");

                        if (idx === -1) registered.push({ name, alias: a, type: "platform" });
                    },

                    registerAccessory: (_p: string, a: string) => {
                        const idx = registered.findIndex((p) => p.alias === a && p.type === "accessory");

                        if (idx === -1) registered.push({ name, alias: a, type: "accessory" });
                    },

                    user: {
                        configPath() {
                            return Paths.config;
                        },

                        storagePath() {
                            return Paths.data();
                        },
                    },
                };

                if (typeof plugin === "function") {
                    plugin(options);
                } else if (plugin && typeof plugin.default === "function") {
                    plugin.default(options);
                }
            } catch (error: any) {
                Console.error(`Unable to determine plugin type for "${name}"`);
                Console.error(error.stack);
            }

            delete require.cache[require.resolve(join(Plugins.directory, main))];
        }

        return registered;
    }

    static getPluginPackage(path: string): { [key: string]: any } {
        const pjson: { [key: string]: any } = Plugins.loadPackage(path);

        if (!pjson) throw new Error(`Plugin ${path} does not contain a proper package.json.`);

        return pjson;
    }

    static loadPackage(directory: string): any {
        const filename: string = join(directory, "package.json");

        let results: any;

        if (existsSync(filename)) {
            try {
                results = JSON.parse(readFileSync(filename).toString());
            } catch (error: any) {
                Console.error(`Plugin ${filename} contains an invalid package`);
                Console.error(error.stack);
            }
        }

        return results;
    }

    static loadSchema(directory: string): any {
        const filename = join(directory, "config.schema.json");

        let results: any;

        if (existsSync(filename)) {
            try {
                results = JSON.parse(readFileSync(filename).toString());
            } catch (error: any) {
                Console.error(`Plugin ${filename} contains an invalid config schema`);
                Console.error(error.stack);
            }
        }

        return results;
    }

    static async definition(identifier: string): Promise<{ [key: string]: any } | undefined> {
        try {
            return (<any>(await Request.get(`https://plugins.hoobs.org/api/${identifier}`)).data || {}).results;
        } catch (_error) {
            Console.warn("plugin site unavailable");
        }

        return undefined;
    }
}
