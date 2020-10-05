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

import _ from "lodash";
import { join } from "path";
import { existsSync, writeFileSync } from "fs-extra";
import State from "../state";
import { InstanceRecord } from "../system/instances";
import Paths from "../system/paths";

import {
    loadJson,
    formatJson,
    jsonEquals,
} from "../formatters";

export default class Config {
    static generateUsername(): string {
        let value = "";

        for (let i = 0; i < 6; i += 1) {
            if (value !== "") value += ":";

            const hex = `00${Math.floor(Math.random() * 255).toString(16).toUpperCase()}`;

            value += hex.substring(hex.length - 2, hex.length);
        }

        return value;
    }

    static configuration(): { [key: string]: any} {
        let pjson = {
            name: "plugins",
            description: "HOOBS Plugins",
            dependencies: {},
        };

        if (existsSync(join(Paths.storagePath(State.id), "package.json"))) pjson = _.extend(pjson, loadJson<any>(join(Paths.storagePath(State.id), "package.json"), {}));

        Config.savePackage(pjson);

        let config: any = {};

        if (State.id === "api") {
            config = {
                api: {
                    origin: "*",
                },
                description: "",
            };
        } else {
            config = {
                server: {
                    origin: "*",
                },
                bridge: {
                    name: "HOOBS",
                    pin: "031-45-154",
                },
                description: "",
                ports: {},
                plugins: [],
                accessories: [],
                platforms: [],
            };
        }

        if (existsSync(Paths.configPath())) config = _.extend(config, loadJson<any>(Paths.configPath(), {}, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML"));

        if (State.id !== "api" && config?.ports !== undefined) {
            if (config?.ports?.start > config?.ports?.end) delete config?.ports;
        }

        if (State.id !== "api" && (!config?.bridge?.username || !(/^([0-9A-F]{2}:){5}([0-9A-F]{2})$/).test(config?.bridge?.username))) {
            config.bridge.username = Config.generateUsername();
        }

        if (State.id !== "api") {
            let instances: any = [];

            if (existsSync(Paths.instancesPath())) instances = loadJson<InstanceRecord[]>(Paths.instancesPath(), []);

            const index = instances.findIndex((n: any) => n.id === State.id);

            if (index >= 0) State.display = instances[index].display;
        }

        Config.saveConfig(config);

        return config;
    }

    static saveConfig(config: any): void {
        let current: any = {};

        if (existsSync(Paths.configPath())) current = loadJson<any>(Paths.configPath(), {}, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML");

        if (State.id !== "api") {
            config.accessories = config?.accessories || [];
            config.platforms = config?.platforms || [];

            Config.filterConfig(config?.accessories);
            Config.filterConfig(config?.platforms);
        }

        if (!jsonEquals(current, config)) {
            writeFileSync(Paths.configPath(), formatJson(config, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML"));
        }
    }

    static touchConfig(): void {
        let config: any = {};

        if (existsSync(Paths.configPath())) config = loadJson<any>(Paths.configPath(), {}, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML");

        writeFileSync(Paths.configPath(), formatJson(config, "5hZ4CHz@m75RDPyTTLM#2p9EU$^3B&ML"));
    }

    static filterConfig(value: any): void {
        if (value) {
            const keys = _.keys(value);

            for (let i = 0; i < keys.length; i += 1) {
                if (value[keys[i]] === null || value[keys[i]] === "") {
                    delete value[keys[i]];
                } else if (Object.prototype.toString.call(value[keys[i]]) === "[object Object]" && Object.entries(value[keys[i]]).length === 0) {
                    delete value[keys[i]];
                } else if (Object.prototype.toString.call(value[keys[i]]) === "[object Object]") {
                    Config.filterConfig(value[keys[i]]);
                } else if (Array.isArray(value[keys[i]]) && value[keys[i]].length === 0) {
                    delete value[keys[i]];
                } else if (Array.isArray(value[keys[i]])) {
                    Config.filterConfig(value[keys[i]]);
                }
            }
        }
    }

    static savePackage(pjson: any): void {
        let current: any = {};

        if (existsSync(join(Paths.storagePath(State.id), "package.json"))) {
            current = loadJson<any>(join(Paths.storagePath(State.id), "package.json"), {});
        }

        if (!jsonEquals(current, pjson)) {
            writeFileSync(join(Paths.storagePath(State.id), "package.json"), formatJson(pjson));
        }
    }
}
