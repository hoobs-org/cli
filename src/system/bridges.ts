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

import Os from "os";
import Unzip from "unzipper";
import Archiver from "archiver";
import Inquirer from "inquirer";

import {
    existsSync,
    writeFileSync,
    unlinkSync,
    ensureDirSync,
    removeSync,
    readdirSync,
    lstatSync,
    createReadStream,
    createWriteStream,
    renameSync,
    copyFileSync,
} from "fs-extra";

import { execSync } from "child_process";
import { join, basename } from "path";
import State from "../state";
import Paths from "./paths";
import Config from "../config";
import { sanitize } from "../formatters";

const PROMPT: Inquirer.PromptModule = Inquirer.createPromptModule();
const BRIDGE_TEARDOWN_DELAY = 1000;

export interface BridgeRecord {
    id: string;
    type: string;
    display: string;
    port: number;
    pin?: string;
    username?: string;
    ports?: { [key: string]: number };
    autostart?: number;
    host?: string;
    plugins?: string;
    advertiser?: string;
    project?: string;
    debugging?: boolean,
}

const reserved = [
    "new",
    "add",
    "bridge",
    "bridges",
    "library",
    "advanced",
];

export default class Bridges {
    static locate() {
        const paths = (process.env.PATH || "").split(":");

        for (let i = 0; i < paths.length; i += 1) {
            if (existsSync(join(paths[i], "hoobsd"))) return paths[i];
        }

        return "";
    }

    static network(): string[] {
        const ifaces: NodeJS.Dict<Os.NetworkInterfaceInfo[]> = Os.networkInterfaces();
        const results: string[] = [];

        Object.keys(ifaces).forEach((ifname: string) => {
            ifaces[ifname]!.forEach((iface: Os.NetworkInterfaceInfo) => {
                if (iface.family !== "IPv4" || iface.internal !== false) return;
                if (results.indexOf(iface.address) === -1) results.push(`${iface.address}`);
            });
        });

        return results;
    }

    static list(): BridgeRecord[] {
        const host = Bridges.network()[0];

        let bridges: BridgeRecord[] = [];

        if (existsSync(Paths.bridges)) bridges = Paths.loadJson<BridgeRecord[]>(Paths.bridges, []);

        for (let i = 0; i < bridges.length; i += 1) {
            bridges[i].host = host;

            if (existsSync(join(Paths.data(bridges[i].id), "package.json"))) bridges[i].plugins = join(Paths.data(bridges[i].id), "node_modules");
        }

        return bridges;
    }

    static uninstall(name: string): boolean {
        if (!name) return false;

        const id = sanitize(name);
        const index = State.bridges.findIndex((n: BridgeRecord) => n.id === id);

        if (index >= 0) {
            removeSync(join(Paths.data(), id));
            removeSync(join(Paths.data(), `${id}.accessories`));
            removeSync(join(Paths.data(), `${id}.persist`));
            removeSync(join(Paths.data(), `${id}.conf`));

            State.bridges.splice(index, 1);

            Paths.saveJson(Paths.bridges, State.bridges);

            return true;
        }

        return false;
    }

    static install(): boolean {
        try {
            if (State.mode === "production" && existsSync("/etc/systemd/system")) {
                if (existsSync("/etc/systemd/system/hoobsd.service")) {
                    execSync("systemctl stop hoobsd.service");
                    execSync("systemctl start hoobsd.service");
                } else {
                    execSync("touch /etc/systemd/system/hoobsd.service");
                    execSync("truncate -s 0 /etc/systemd/system/hoobsd.service");

                    execSync("echo \"[Unit]\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"Description=HOOBSD\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"After=network-online.target\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"[Service]\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"Type=simple\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"User=root\" >> /etc/systemd/system/hoobsd.service");
                    execSync(`echo "ExecStart=${join(Bridges.locate(), "hoobsd")} hub" >> /etc/systemd/system/hoobsd.service`);
                    execSync("echo \"Restart=always\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"RestartSec=3\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"KillSignal=SIGINT\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"[Install]\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"WantedBy=multi-user.target\" >> /etc/systemd/system/hoobsd.service");
                    execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");

                    execSync("systemctl daemon-reload");
                    execSync("systemctl enable hoobsd.service");
                    execSync("systemctl start hoobsd.service");
                }

                return true;
            }

            if (State.mode === "production" && existsSync("/Library/LaunchDaemons/")) {
                if (existsSync("/Library/LaunchDaemons/org.hoobsd.plist")) {
                    execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.plist");
                } else {
                    execSync("touch /Library/LaunchDaemons/org.hoobsd.plist");

                    execSync("echo \"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"<plist version=\"1.0\">\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"    <dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>Label</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <string>org.hoobsd.hub</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>EnvironmentVariables</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <key>PATH</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <string><![CDATA[/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin]]></string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <key>HOME</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"            <string>/var/root</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        </dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>Program</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync(`echo "        <string>${join(Bridges.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.plist`);
                    execSync("echo \"        <key>ProgramArguments</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <array>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync(`echo "            <string>${join(Bridges.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.plist`);
                    execSync("echo \"            <string>hub</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        </array>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>RunAtLoad</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>KeepAlive</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <key>SessionCreate</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"    </dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                    execSync("echo \"</plist>\" >> /Library/LaunchDaemons/org.hoobsd.plist");

                    execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.plist");
                }

                return true;
            }

            return true;
        } catch (_error) {
            return false;
        }
    }

    static append(id: string, display: string, type: string, port: number, pin: string, username: string, autostart: number, advertiser: string, project?: string) {
        const bridges: BridgeRecord[] = [];

        for (let i = 0; i < State.bridges.length; i += 1) {
            const { ...bridge } = State.bridges[i];

            if (bridge.id === "hub") {
                bridges.unshift({
                    id: bridge.id,
                    type: bridge.type,
                    display: bridge.display,
                    port: bridge.port,
                    pin: bridge.pin,
                    username: bridge.username,
                    autostart: 0,
                    advertiser: undefined,
                });
            } else {
                bridges.push({
                    id: bridge.id,
                    type: bridge.type,
                    display: bridge.display,
                    port: bridge.port,
                    pin: bridge.pin,
                    username: bridge.username,
                    autostart: bridge.autostart,
                    advertiser: bridge.advertiser,
                    project: bridge.project,
                });
            }
        }

        if (id === "hub") {
            bridges.unshift({
                id,
                type,
                display,
                port: parseInt(`${port}`, 10),
                pin,
                username,
                autostart: 0,
                advertiser: undefined,
            });
        } else {
            bridges.push({
                id,
                type,
                display,
                port: parseInt(`${port}`, 10),
                pin,
                username,
                autostart: autostart || 0,
                advertiser,
                project: type === "dev" ? project : undefined,
            });
        }

        Paths.saveJson(Paths.bridges, bridges);
    }

    static create(name: string, port: number, pin: string, autostart: number, advertiser?: string): Promise<boolean> {
        return new Promise((resolve) => {
            let id = sanitize(name);

            if (!existsSync(Paths.bridges)) writeFileSync(Paths.bridges, "[]");

            if (name && reserved.indexOf(id) === -1 && port && State.bridges.findIndex((n) => n.id === id) === -1 && State.bridges.findIndex((n) => n.port === port) === -1) {
                if (id === "hub" && State.mode === "production") Bridges.install();

                Bridges.append(id, name, id === "hub" ? "hub" : "bridge", port, pin, Config.generateUsername(), autostart, advertiser || "bonjour");

                resolve(true);
            } else {
                PROMPT([
                    {
                        type: "input",
                        name: "name",
                        message: "enter a name for this bridge",
                        validate: (value: string | undefined) => {
                            if (!value || value === "") return "a name is required";
                            if (reserved.indexOf(sanitize(value)) >= 0) return "name reserved please choose a different name";
                            if (State.bridges.findIndex((n) => n.id === sanitize(value)) >= 0) return "bridge name must be uniqie";

                            return true;
                        },
                    },
                    {
                        type: "list",
                        name: "type",
                        message: "select a bridgetype",
                        choices: [{
                            name: "Bridge",
                            value: "bridge",
                        }, {
                            name: "Development",
                            value: "dev",
                        }],
                    },
                    {
                        type: "input",
                        name: "project",
                        message: "set your project path",
                        when: (answers) => answers.type === "dev",
                        validate: (value: string | undefined) => {
                            if (!value) return "a projact path is required";
                            if (!existsSync(join(value || "", "package.json"))) return "invalid project path";

                            return true;
                        },
                    },
                    {
                        type: "number",
                        name: "port",
                        default: () => {
                            port = port || 50826;

                            while (State.bridges.findIndex((item) => parseInt(`${item.port}`, 10) === port) >= 0) port += 1000;

                            return `${port}`;
                        },
                        message: "enter the port for the bridge",
                        validate: (value: number | undefined) => {
                            if (!value || Number.isNaN(value)) return "invalid port number";
                            if (value < 1 || value > 65535) return "select a port between 1 and 65535";
                            if (State.bridges.findIndex((n) => n.port === value) >= 0) return "port is already in use";

                            return true;
                        },
                    },
                    {
                        type: "input",
                        name: "pin",
                        message: "enter a pin for the bridge",
                        default: "031-45-154",
                    },
                    {
                        type: "list",
                        name: "advertiser",
                        message: "Please select an advertiser",
                        default: "bonjour",
                        choices: [{
                            name: "Bonjour",
                            value: "bonjour",
                        }, {
                            name: "Ciao",
                            value: "ciao",
                        }],
                    },
                    {
                        type: "number",
                        name: "autostart",
                        default: "0",
                        message: "delay the start of the bridge (in seconds)?",
                        validate: (value: number | undefined) => {
                            if (!value || Number.isNaN(value)) return "invalid number";
                            if (value < -1 || value > 500) return "select a port between -1 and 500";

                            return true;
                        },
                    },
                ]).then((answers) => {
                    if (answers && answers.name && answers.port) {
                        id = sanitize(answers.name);

                        if (id === "hub" && State.mode === "production") Bridges.install();

                        Bridges.append(id, answers.name, id === "hub" ? "hub" : answers.type, answers.port, answers.pin, Config.generateUsername(), answers.autostart, answers.advertiser, answers.project);

                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            }
        });
    }

    static cache(): { [key: string]: any }[] {
        const working = Paths.loadJson<{ [key: string]: any }[]>(join(Paths.data(), `${State.id}.accessories`, "cachedAccessories"), [], undefined, true);

        return working.map((item: { [key: string]: any }) => ({
            uuid: item.UUID,
            bridge: State.id,
            name: item.displayName,
            plugin: item.plugin,
        }));
    }

    static purge(uuid?: string): void {
        if (uuid) {
            const working = Paths.loadJson<{ [key: string]: any }[]>(join(Paths.data(), `${State.id}.accessories`, "cachedAccessories"), [], undefined, true);
            let index = working.findIndex((item: { [key: string]: any }) => item.UUID === uuid);

            while (index >= 0) {
                working.splice(index, 1);
                index = working.findIndex((item: { [key: string]: any }) => item.UUID === uuid);
            }

            Paths.saveJson(join(Paths.data(), `${State.id}.accessories`, "cachedAccessories"), working, false, undefined, true);
        } else {
            if (existsSync(join(Paths.data(), `${State.id}.persist`))) removeSync(join(Paths.data(), `${State.id}.persist`));

            ensureDirSync(join(Paths.data(), `${State.id}.persist`));

            if (existsSync(join(Paths.data(), `${State.id}.accessories`))) removeSync(join(Paths.data(), `${State.id}.accessories`));

            ensureDirSync(join(Paths.data(), `${State.id}.accessories`));
        }
    }

    static async reset(): Promise<void> {
        await Bridges.backup();

        const entries = readdirSync(Paths.data());

        for (let i = 0; i < entries.length; i += 1) {
            const path = join(Paths.data(), entries[i]);

            if (path !== Paths.backups) {
                if (lstatSync(path).isDirectory()) {
                    removeSync(path);
                } else {
                    unlinkSync(path);
                }
            }
        }

        if (State.mode === "production" && existsSync("/etc/systemd/system/hoobsd.service")) {
            execSync("systemctl stop hoobsd.service");
            execSync("systemctl disable hoobsd.service");

            execSync("rm -f /etc/systemd/system/hoobsd.service");
        }

        if (State.mode === "production" && existsSync("/Library/LaunchDaemons/org.hoobsd.plist")) {
            execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.plist");
            execSync("rm -f /Library/LaunchDaemons/org.hoobsd.plist");
        }
    }

    static export(id: string): Promise<string> {
        return new Promise((resolve, reject) => {
            id = sanitize(id);

            const bridge = State.bridges.find((item) => item.id === id);

            Paths.saveJson(join(Paths.data(), "meta"), {
                date: (new Date()).getTime(),
                type: "bridge",
                data: {
                    type: bridge?.type,
                    ports: bridge?.ports,
                    autostart: bridge?.autostart,
                    advertiser: bridge?.advertiser,
                },
                product: "hoobs",
                generator: "hbs",
                version: State.version,
            });

            if (!bridge) reject(new Error("bridge does not exist"));

            const filename = `${id}_${new Date().getTime()}`;
            const output = createWriteStream(join(Paths.backups, `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backups, `${filename}.zip`), join(Paths.backups, `${filename}.bridge`));
                unlinkSync(join(Paths.data(), "meta"));

                resolve(`${filename}.bridge`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            archive.file(join(Paths.data(), "meta"), { name: "meta" });
            archive.file(join(Paths.data(), `${bridge?.id}.conf`), { name: `${bridge?.id}.conf` });

            Bridges.dig(archive, join(Paths.data(), `${bridge?.id}`));

            archive.finalize();
        });
    }

    static backup(): Promise<string> {
        return new Promise((resolve, reject) => {
            Paths.saveJson(join(Paths.data(), "meta"), {
                date: (new Date()).getTime(),
                type: "full",
                product: "hoobs",
                generator: "hbs",
                version: State.version,
            });

            const filename = `${new Date().getTime()}`;
            const entries = readdirSync(Paths.data());
            const output = createWriteStream(join(Paths.backups, `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backups, `${filename}.zip`), join(Paths.backups, `${filename}.backup`));
                unlinkSync(join(Paths.data(), "meta"));

                resolve(`${filename}.backup`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            for (let i = 0; i < entries.length; i += 1) {
                const path = join(Paths.data(), entries[i]);

                if (path !== Paths.backups) {
                    if (lstatSync(path).isDirectory()) {
                        Bridges.dig(archive, path);
                    } else {
                        archive.file(path, { name: entries[i] });
                    }
                }
            }

            archive.finalize();
        });
    }

    static dig(archive: Archiver.Archiver, directory: string): void {
        const entries = readdirSync(directory);

        for (let i = 0; i < entries.length; i += 1) {
            const path = join(directory, entries[i]);

            if (basename(path) !== "node_modules" && basename(path) !== "cache") {
                if (lstatSync(path).isDirectory()) {
                    archive.directory(path, join(basename(directory), entries[i]));
                } else {
                    archive.file(path, { name: join(basename(directory), entries[i]) });
                }
            }
        }
    }

    static metadata(file: string): Promise<{ [key: string]: any }> {
        return new Promise((resolve) => {
            let results: { [key: string]: any } = {};

            createReadStream(file).pipe(Unzip.Parse()).on("entry", (entry) => {
                const filename = entry.path;
                const { type } = entry;

                if (type === "File" && filename === "meta") {
                    entry.buffer().then((content: any) => {
                        try {
                            results = JSON.parse(content);
                        } catch (_error) {
                            results = {};
                        }
                    });
                } else {
                    entry.autodrain();
                }
            }).on("finish", () => {
                resolve(results);
            });
        });
    }

    static restore(file: string, remove?: boolean): Promise<void> {
        return new Promise((resolve) => {
            Bridges.metadata(file).then((metadata) => {
                if (metadata.type === "full") {
                    const filename = join(Paths.data(), `restore-${new Date().getTime()}.zip`);
                    const entries = readdirSync(Paths.data());

                    for (let i = 0; i < entries.length; i += 1) {
                        const path = join(Paths.data(), entries[i]);

                        if (path !== Paths.backups) {
                            if (lstatSync(path).isDirectory()) {
                                removeSync(path);
                            } else {
                                unlinkSync(path);
                            }
                        }
                    }

                    if (remove) {
                        renameSync(file, filename);
                    } else {
                        copyFileSync(file, filename);
                    }

                    createReadStream(filename).pipe(Unzip.Extract({
                        path: Paths.data(),
                    })).on("finish", () => {
                        unlinkSync(filename);

                        setTimeout(() => {
                            const bridges = Paths.loadJson<BridgeRecord[]>(Paths.bridges, []);

                            for (let i = 0; i < bridges.length; i += 1) {
                                execSync(`${Paths.yarn} install --unsafe-perm --ignore-engines --network-timeout 100000 --network-concurrency 1 --force --verbose`, {
                                    cwd: Paths.data(bridges[i].id),
                                    stdio: "inherit",
                                });
                            }

                            if (bridges.find((item) => item.type === "hub") && State.mode === "production") Bridges.install();

                            resolve();
                        }, BRIDGE_TEARDOWN_DELAY);
                    });
                } else {
                    resolve();
                }
            });
        });
    }
}
