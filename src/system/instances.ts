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

/* eslint-disable arrow-body-style */

import Os from "os";
import Chalk from "chalk";
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
import Socket from "./socket";
import Config from "../config";
import { Events, NotificationType } from "../logger";

import {
    loadJson,
    formatJson,
    sanitize,
} from "../formatters";

const prompt: Inquirer.PromptModule = Inquirer.createPromptModule();

export interface InstanceRecord {
    id: string;
    type: string;
    display: string;
    port: number;
    pin?: string;
    username?: string;
    ports?: { [key: string]: number};
    autostart?: number;
    host?: string;
    plugins?: string;
}

export default class Instances {
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

    static initSystem() {
        if (existsSync("/etc/systemd/system")) return "systemd";
        if (existsSync("/Library/LaunchDaemons/")) return "launchd";

        return null;
    }

    static list(): InstanceRecord[] {
        const host = Instances.network()[0];

        let instances: InstanceRecord[] = [];

        if (existsSync(Paths.instancesPath())) instances = loadJson<InstanceRecord[]>(Paths.instancesPath(), []);

        for (let i = 0; i < instances.length; i += 1) {
            instances[i].host = host;

            if (existsSync(join(Paths.storagePath(instances[i].id), "package.json"))) instances[i].plugins = join(Paths.storagePath(instances[i].id), "node_modules");
        }

        return instances;
    }

    static removeService(name: string): Promise<boolean> {
        return new Promise((resolve) => {
            if (!name) {
                resolve(false);
            } else {
                const id = sanitize(name);
                const index = State.instances.findIndex((n: InstanceRecord) => n.id === id);

                if (index >= 0) {
                    Socket.emit(Events.NOTIFICATION, {
                        instance: "api",
                        data: {
                            title: "Instance Removed",
                            description: `Instance "${name}" removed.`,
                            type: NotificationType.WARN,
                            icon: "layers",
                        },
                    }).then(() => {
                        removeSync(join(Paths.storagePath(), id));
                        removeSync(join(Paths.storagePath(), `${id}.accessories`));
                        removeSync(join(Paths.storagePath(), `${id}.persist`));
                        removeSync(join(Paths.storagePath(), `${id}.conf`));

                        State.instances.splice(index, 1);

                        writeFileSync(Paths.instancesPath(), formatJson(State.instances));

                        resolve(true);
                    });
                } else {
                    Socket.emit(Events.NOTIFICATION, {
                        instance: "api",
                        data: {
                            title: "Instance Not Removed",
                            description: `Unable to remove instance "${name}".`,
                            type: NotificationType.ERROR,
                        },
                    }).then(() => {
                        resolve(false);
                    });
                }
            }
        });
    }

    static launchService(): boolean {
        const type = Instances.initSystem() || "";

        try {
            switch (type) {
                case "systemd":
                    if (existsSync("/etc/systemd/system/hoobsd.service")) {
                        execSync("systemctl stop hoobsd.service");
                        execSync("systemctl start hoobsd.service");
                    } else {
                        execSync("touch /etc/systemd/system/hoobsd.service");
                        execSync("truncate -s 0 /etc/systemd/system/hoobsd.service");

                        execSync("echo \"[Unit]\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"Description=HOOBS API\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"After=network-online.target\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"[Service]\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"Type=simple\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"User=root\" >> /etc/systemd/system/hoobsd.service");
                        execSync(`echo "ExecStart=${join(Instances.locate(), "hoobsd")} api" >> /etc/systemd/system/hoobsd.service`);
                        execSync("echo \"Restart=on-failure\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"RestartSec=3\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"KillMode=process\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"[Install]\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"WantedBy=multi-user.target\" >> /etc/systemd/system/hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/hoobsd.service");

                        execSync("systemctl daemon-reload");
                        execSync("systemctl enable hoobsd.service");
                        execSync("systemctl start hoobsd.service");
                    }

                    return true;

                case "launchd":
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
                        execSync("echo \"        <string>org.hoobsd.api</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"        <key>EnvironmentVariables</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"        <dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"            <key>PATH</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"            <string><![CDATA[/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin]]></string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"            <key>HOME</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"            <string>/var/root</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"        </dict>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"        <key>Program</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync(`echo "        <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.plist`);
                        execSync("echo \"        <key>ProgramArguments</key>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("echo \"        <array>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync(`echo "            <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.plist`);
                        execSync("echo \"            <string>api</string>\" >> /Library/LaunchDaemons/org.hoobsd.plist");
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

                default:
                    return true;
            }
        } catch (_error) {
            return false;
        }
    }

    static appendInstance(id: string, display: string, type: string, port: number, pin: string, username: string, autostart: number) {
        const instances: InstanceRecord[] = [];

        for (let i = 0; i < State.instances.length; i += 1) {
            const { ...instance } = State.instances[i];

            if (instance.id === "api") {
                instances.unshift({
                    id: instance.id,
                    type: instance.type,
                    display: instance.display,
                    port: instance.port,
                    pin: instance.pin,
                    username: instance.username,
                    autostart: 0,
                });
            } else {
                instances.push({
                    id: instance.id,
                    type: instance.type,
                    display: instance.display,
                    port: instance.port,
                    pin: instance.pin,
                    username: instance.username,
                    autostart: instance.autostart,
                });
            }
        }

        if (id === "api") {
            instances.unshift({
                id,
                type,
                display,
                port: parseInt(`${port}`, 10),
                pin,
                username,
                autostart: 0,
            });
        } else {
            instances.push({
                id,
                type,
                display,
                port: parseInt(`${port}`, 10),
                pin,
                username,
                autostart: autostart || 0,
            });
        }

        writeFileSync(Paths.instancesPath(), formatJson(instances));
    }

    static createService(name: string, port: number, pin: string, autostart: number, skip?: boolean): Promise<boolean> {
        return new Promise((resolve) => {
            if (!existsSync(Paths.instancesPath())) writeFileSync(Paths.instancesPath(), "[]");

            if (name && port && State.instances.findIndex((n) => n.id === sanitize(name)) === -1 && State.instances.findIndex((n) => n.port === port) === -1) {
                if (sanitize(name) === "api" && !skip) Instances.launchService();

                Socket.emit(Events.NOTIFICATION, {
                    instance: "api",
                    data: {
                        title: "Instance Added",
                        description: `Instance "${name}" added.`,
                        type: NotificationType.SUCCESS,
                        icon: "layers",
                    },
                }).then(() => {
                    if (sanitize(name) === "api") {
                        console.log("api created you can start the api with this command");
                        console.log(Chalk.yellow(`${join(Instances.locate(), "hoobsd")} api`));
                    } else {
                        console.log("instance created you can start the instance with this command");
                        console.log(Chalk.yellow(`${join(Instances.locate(), "hoobsd")} start --instance '${sanitize(name)}'`));
                    }

                    Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port, pin, Config.generateUsername(), autostart);

                    resolve(true);
                });
            } else {
                prompt([
                    {
                        type: "input",
                        name: "name",
                        message: "enter a name for this instance",
                        validate: (value: string | undefined) => {
                            if (!value || value === "") return "a name is required";
                            if (State.instances.findIndex((n) => n.id === sanitize(value)) >= 0) return "instance name must be uniqie";

                            return true;
                        },
                    },
                    {
                        type: "number",
                        name: "port",
                        default: () => {
                            port = port || 50826;

                            while (State.instances.findIndex((item) => parseInt(`${item.port}`, 10) === port) >= 0) port += 1000;

                            return `${port}`;
                        },
                        message: "enter the port for the instance",
                        validate: (value: number | undefined) => {
                            if (!value || Number.isNaN(value)) return "invalid port number";
                            if (value < 1 || value > 65535) return "select a port between 1 and 65535";
                            if (State.instances.findIndex((n) => n.port === value) >= 0) return "port is already in use";

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
                ]).then((result) => {
                    if (result && result.name && result.port) {
                        const id = sanitize(result.name);

                        if (sanitize(name) === "api" && !skip) Instances.launchService();

                        Socket.emit(Events.NOTIFICATION, {
                            instance: "api",
                            data: {
                                title: "Instance Added",
                                description: `Instance "${result.name}" added.`,
                                type: NotificationType.SUCCESS,
                                icon: "layers",
                            },
                        }).then(() => {
                            Instances.appendInstance(id, result.name, id === "api" ? "api" : "bridge", result.port, result.pin, Config.generateUsername(), result.autostart);

                            if (id === "api") {
                                console.log("api created you can start the api with this command");
                                console.log(Chalk.yellow(`${join(Instances.locate(), "hoobsd")} api`));
                            } else {
                                console.log("instance created you can start the instance with this command");
                                console.log(Chalk.yellow(`${join(Instances.locate(), "hoobsd")} start --instance '${id}'`));
                            }

                            resolve(true);
                        });
                    } else {
                        resolve(false);
                    }
                });
            }
        });
    }

    static purge(): Promise<void> {
        return new Promise((resolve) => {
            if (existsSync(join(Paths.storagePath(), `${State.id}.persist`))) removeSync(join(Paths.storagePath(), `${State.id}.persist`));

            ensureDirSync(join(Paths.storagePath(), `${State.id}.persist`));

            if (existsSync(join(Paths.storagePath(), `${State.id}.accessories`))) removeSync(join(Paths.storagePath(), `${State.id}.accessories`));

            ensureDirSync(join(Paths.storagePath(), `${State.id}.accessories`));

            Socket.emit(Events.NOTIFICATION, {
                instance: State.id,
                data: {
                    title: "Caches Purged",
                    description: "Accessory and connection cache purged.",
                    type: NotificationType.SUCCESS,
                    icon: "memory",
                },
            }).then(() => {
                resolve();
            });
        });
    }

    static async reset(skip?: boolean): Promise<void> {
        let type = "";

        if (!skip) {
            type = Instances.initSystem() || "";
        }

        await Instances.backup();

        const instances = Instances.list();
        const entries = readdirSync(Paths.storagePath());

        for (let i = 0; i < entries.length; i += 1) {
            const path = join(Paths.storagePath(), entries[i]);

            if (path !== Paths.backupPath()) {
                if (lstatSync(path).isDirectory()) {
                    removeSync(path);
                } else {
                    unlinkSync(path);
                }
            }
        }

        for (let i = 0; i < instances.length; i += 1) {
            switch (type) {
                case "systemd":
                    if (existsSync("/etc/systemd/system/hoobsd.service")) {
                        execSync("systemctl stop hoobsd.service");
                        execSync("systemctl disable hoobsd.service");

                        execSync("rm -f /etc/systemd/system/hoobsd.service");
                    }

                    break;

                case "launchd":
                    if (existsSync("/Library/LaunchDaemons/org.hoobsd.plist")) {
                        execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.plist");
                        execSync("rm -f /Library/LaunchDaemons/org.hoobsd.plist");
                    }

                    break;
            }
        }
    }

    static export(id: string): Promise<string> {
        return new Promise((resolve, reject) => {
            id = sanitize(id);

            const instance = State.instances.find((item) => item.id === id);

            writeFileSync(join(Paths.storagePath(), "meta"), formatJson({
                date: (new Date()).getTime(),
                type: "instance",
                data: {
                    type: instance?.type,
                    ports: instance?.ports,
                    autostart: instance?.autostart,
                },
                product: "hoobs",
                generator: "hbs",
                version: State.version,
            }));

            if (!instance) reject(new Error("instance does not exist"));

            const filename = `${id}_${new Date().getTime()}`;
            const output = createWriteStream(join(Paths.backupPath(), `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backupPath(), `${filename}.zip`), join(Paths.backupPath(), `${filename}.instance`));
                unlinkSync(join(Paths.storagePath(), "meta"));

                resolve(`${filename}.instance`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            archive.file(join(Paths.storagePath(), "meta"), { name: "meta" });
            archive.file(join(Paths.storagePath(), `${instance?.id}.conf`), { name: `${instance?.id}.conf` });

            Instances.dig(archive, join(Paths.storagePath(), `${instance?.id}`));

            archive.finalize();
        });
    }

    static backup(): Promise<string> {
        return new Promise((resolve, reject) => {
            writeFileSync(join(Paths.storagePath(), "meta"), formatJson({
                date: (new Date()).getTime(),
                type: "full",
                product: "hoobs",
                generator: "hbs",
                version: State.version,
            }));

            const filename = `${new Date().getTime()}`;
            const entries = readdirSync(Paths.storagePath());
            const output = createWriteStream(join(Paths.backupPath(), `${filename}.zip`));
            const archive = Archiver("zip");

            output.on("close", () => {
                renameSync(join(Paths.backupPath(), `${filename}.zip`), join(Paths.backupPath(), `${filename}.backup`));
                unlinkSync(join(Paths.storagePath(), "meta"));

                resolve(`${filename}.backup`);
            });

            archive.on("error", (error) => {
                reject(error);
            });

            archive.pipe(output);

            for (let i = 0; i < entries.length; i += 1) {
                const path = join(Paths.storagePath(), entries[i]);

                if (path !== Paths.backupPath()) {
                    if (lstatSync(path).isDirectory()) {
                        Instances.dig(archive, path);
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

            createReadStream(file)
                .pipe(Unzip.Parse())
                .on("entry", async (entry) => {
                    const filename = entry.path;

                    if (filename === "meta") {
                        const content = await entry.buffer();

                        try {
                            results = JSON.parse(content);
                        } catch (_error) {
                            results = {};
                        }
                    } else {
                        entry.autodrain();

                        resolve(results);
                    }
                });
        });
    }

    static restore(file: string, remove?: boolean, skip?: boolean): Promise<void> {
        return new Promise((resolve) => {
            Instances.metadata(file).then((metadata) => {
                if (metadata.type === "full") {
                    const filename = join(Paths.storagePath(), `restore-${new Date().getTime()}.zip`);
                    const entries = readdirSync(Paths.storagePath());

                    for (let i = 0; i < entries.length; i += 1) {
                        const path = join(Paths.storagePath(), entries[i]);

                        if (path !== Paths.backupPath()) {
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
                        path: Paths.storagePath(),
                    })).on("finish", () => {
                        unlinkSync(filename);

                        setTimeout(() => {
                            const instances = loadJson<InstanceRecord[]>(Paths.instancesPath(), []);

                            for (let i = 0; i < instances.length; i += 1) {
                                execSync(`${Paths.yarn()} install --unsafe-perm --ignore-engines`, {
                                    cwd: Paths.storagePath(instances[i].id),
                                    stdio: "inherit",
                                });
                            }

                            if (instances.find((item) => item.type === "api") && !skip) Instances.launchService();

                            resolve();
                        }, 1000);
                    });
                } else {
                    resolve();
                }
            });
        });
    }
}
