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
import { Events, NotificationType } from "../logger";

import {
    loadJson,
    formatJson,
    sanitize,
} from "../formatters";

const prompt: Inquirer.PromptModule = Inquirer.createPromptModule();

export interface InstanceRecord {
    id: string,
    type: string,
    display: string,
    port: number,
    host?: string,
    plugins?: string,
    service?: string,
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
        const type = Instances.initSystem();
        const host = Instances.network()[0];

        let instances: InstanceRecord[] = [];

        if (existsSync(Paths.instancesPath())) instances = loadJson<InstanceRecord[]>(Paths.instancesPath(), []);

        for (let i = 0; i < instances.length; i += 1) {
            instances[i].host = host;
            instances[i].service = undefined;

            if (existsSync(join(Paths.storagePath(instances[i].id), "package.json"))) instances[i].plugins = join(Paths.storagePath(instances[i].id), "node_modules");

            switch (type) {
                case "systemd":
                    if (existsSync(`/etc/systemd/system/${instances[i].id}.hoobsd.service`)) instances[i].service = `${instances[i].id}.hoobsd.service`;

                    break;

                case "launchd":
                    if (existsSync(`/Library/LaunchDaemons/org.hoobsd.${instances[i].id}.plist`)) instances[i].service = `org.hoobsd.${instances[i].id}.plist`;

                    break;

                default:
                    break;
            }
        }

        return instances;
    }

    static renameInstance(name: string, display: string): Promise<boolean> {
        return new Promise((resolve) => {
            if (!name) return resolve(false);

            const id = sanitize(name);
            const index = State.instances.findIndex((n) => n.id === id);

            if (index >= 0) {
                State.instances[index].display = display;

                writeFileSync(Paths.instancesPath(), formatJson(State.instances));

                return resolve(true);
            }

            return resolve(false);
        });
    }

    static removeSystemd(id: string): Promise<boolean> {
        return new Promise((resolve) => {
            if (existsSync(`/etc/systemd/system/${id}.hoobsd.service`)) {
                try {
                    execSync(`systemctl stop ${id}.hoobsd.service`);
                    execSync(`systemctl disable ${id}.hoobsd.service`);

                    execSync(`rm -f /etc/systemd/system/${id}.hoobsd.service`);

                    return resolve(true);
                } catch (_error) {
                    return resolve(false);
                }
            }

            return resolve(false);
        });
    }

    static removeLaunchd(id: string): Promise<boolean> {
        return new Promise((resolve) => {
            if (existsSync(`/Library/LaunchDaemons/org.hoobsd.${id}.plist`)) {
                try {
                    execSync(`launchctl unload /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                    execSync(`rm -f /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                    return resolve(true);
                } catch (_error) {
                    return resolve(false);
                }
            }

            return resolve(false);
        });
    }

    static removeService(name: string, skip?: boolean): Promise<boolean> {
        return new Promise((resolve) => {
            let type = Instances.initSystem();

            if (!name) {
                resolve(false);
            } else {
                if (skip) type = null;

                const id = sanitize(name);
                const index = State.instances.findIndex((n: InstanceRecord) => n.id === id);

                if (index >= 0) {
                    switch (type) {
                        case "systemd":
                            Instances.removeSystemd(id).then((success) => {
                                if (success) {
                                    Socket.emit(Events.NOTIFICATION, {
                                        instance: "api",
                                        data: {
                                            title: "Instance Removed",
                                            description: `Instance "${name} removed.`,
                                            type: NotificationType.WARN,
                                            icon: "layers",
                                        },
                                    }).then(() => {
                                        State.instances.splice(index, 1);

                                        writeFileSync(Paths.instancesPath(), formatJson(State.instances));

                                        removeSync(join(Paths.storagePath(), id));
                                        removeSync(join(Paths.storagePath(), `${id}.accessories`));
                                        removeSync(join(Paths.storagePath(), `${id}.persist`));
                                        removeSync(join(Paths.storagePath(), `${id}.conf`));

                                        resolve(true);
                                    });
                                } else {
                                    Socket.emit(Events.NOTIFICATION, {
                                        instance: "api",
                                        data: {
                                            title: "Instance Not Removed",
                                            description: `Unable to remove instance "${name}.`,
                                            type: NotificationType.ERROR,
                                        },
                                    }).then(() => {
                                        resolve(false);
                                    });
                                }
                            });

                            break;

                        case "launchd":
                            Instances.removeLaunchd(id).then((success) => {
                                if (success) {
                                    Socket.emit(Events.NOTIFICATION, {
                                        instance: "api",
                                        data: {
                                            title: "Instance Removed",
                                            description: `Instance "${name} removed.`,
                                            type: NotificationType.WARN,
                                            icon: "layers",
                                        },
                                    }).then(() => {
                                        State.instances.splice(index, 1);

                                        writeFileSync(Paths.instancesPath(), formatJson(State.instances));

                                        removeSync(join(Paths.storagePath(), id));
                                        removeSync(join(Paths.storagePath(), `${id}.accessories`));
                                        removeSync(join(Paths.storagePath(), `${id}.persist`));
                                        removeSync(join(Paths.storagePath(), `${id}.conf`));

                                        resolve(true);
                                    });
                                } else {
                                    Socket.emit(Events.NOTIFICATION, {
                                        instance: "api",
                                        data: {
                                            title: "Instance Not Removed",
                                            description: `Unable to remove instance "${name}.`,
                                            type: NotificationType.ERROR,
                                        },
                                    }).then(() => {
                                        resolve(false);
                                    });
                                }
                            });

                            break;
                        default:
                            Socket.emit(Events.NOTIFICATION, {
                                instance: "api",
                                data: {
                                    title: "Instance Removed",
                                    description: `Instance "${name} removed.`,
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
                    }
                } else {
                    Socket.emit(Events.NOTIFICATION, {
                        instance: "api",
                        data: {
                            title: "Instance Not Removed",
                            description: `Unable to remove instance "${name}.`,
                            type: NotificationType.ERROR,
                        },
                    }).then(() => {
                        resolve(false);
                    });
                }
            }
        });
    }

    static createSystemd(name: string, port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const id = sanitize(name);
            const display = name;

            if (
                !Number.isNaN(port)
                && id !== "static"
                && id !== "backups"
                && id !== "interface"
                && State.instances.findIndex((n) => n.id === id) === -1
                && State.instances.findIndex((n) => n.port === port) === -1
            ) {
                try {
                    if (id === "api") {
                        execSync("touch /etc/systemd/system/api.hoobsd.service");
                        execSync("truncate -s 0 /etc/systemd/system/api.hoobsd.service");

                        execSync("echo \"[Unit]\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"Description=HOOBS API\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"After=network-online.target\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"[Service]\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"Type=simple\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"User=root\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync(`echo "ExecStart=${join(Instances.locate(), "hoobsd")} api" >> /etc/systemd/system/api.hoobsd.service`);
                        execSync("echo \"Restart=on-failure\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"RestartSec=3\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"KillMode=process\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"[Install]\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"WantedBy=multi-user.target\" >> /etc/systemd/system/api.hoobsd.service");
                        execSync("echo \"\" >> /etc/systemd/system/api.hoobsd.service");

                        execSync("systemctl daemon-reload");
                        execSync("systemctl enable api.hoobsd.service");
                        execSync("systemctl start api.hoobsd.service");
                    } else {
                        execSync(`touch /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`truncate -s 0 /etc/systemd/system/${id}.hoobsd.service`);

                        execSync(`echo "[Unit]" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "Description=HOOBS ${display}" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "After=network-online.target" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "[Service]" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "Type=simple" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "User=root" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "ExecStart=${join(Instances.locate(), "hoobsd")} start --instance '${id}'" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "Restart=on-failure" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "RestartSec=3" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "KillMode=process" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "[Install]" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "WantedBy=multi-user.target" >> /etc/systemd/system/${id}.hoobsd.service`);
                        execSync(`echo "" >> /etc/systemd/system/${id}.hoobsd.service`);

                        execSync("systemctl daemon-reload");
                        execSync(`systemctl enable ${id}.hoobsd.service`);
                        execSync(`systemctl start ${id}.hoobsd.service`);
                    }

                    resolve(true);
                } catch (_error) {
                    resolve(false);
                }
            } else if (id === "default") {
                console.log(`${display} instance is already created`);

                resolve(false);
            } else {
                console.log("State must have a unique name, server port and bridge port");

                resolve(false);
            }
        });
    }

    static createLaunchd(name: string, port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const id = sanitize(name);
            const display = name;

            if (
                !Number.isNaN(port)
                && State.instances.findIndex((n) => n.id === id) === -1
                && State.instances.findIndex((n) => n.port === port) === -1
            ) {
                try {
                    if (id === "api") {
                        execSync("touch /Library/LaunchDaemons/org.hoobsd.api.plist");

                        execSync("echo \"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"<plist version=\"1.0\">\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"    <dict>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>Label</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <string>org.hoobsd.api</string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>EnvironmentVariables</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <dict>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <key>PATH</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <string><![CDATA[/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin]]></string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <key>HOME</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"            <string>/var/root</string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        </dict>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>Program</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync(`echo "        <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.api.plist`);
                        execSync("echo \"        <key>ProgramArguments</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <array>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync(`echo "            <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.api.plist`);
                        execSync("echo \"            <string>api</string>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        </array>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>RunAtLoad</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>KeepAlive</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <key>SessionCreate</key>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"        <true/>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"    </dict>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");
                        execSync("echo \"</plist>\" >> /Library/LaunchDaemons/org.hoobsd.api.plist");

                        execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.api.plist");
                    } else {
                        execSync(`touch /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                        execSync(`echo "<?xml version="1.0" encoding="UTF-8"?>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "<plist version="1.0">" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "    <dict>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>Label</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <string>org.hoobsd.${id}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>EnvironmentVariables</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <dict>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <key>PATH</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string><![CDATA[/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin]]></string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <key>HOME</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>/var/root</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        </dict>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>Program</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>ProgramArguments</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <array>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>${join(Instances.locate(), "hoobsd")}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>start</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>--instance</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "            <string>${id}</string>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        </array>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>RunAtLoad</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <true/>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>KeepAlive</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <true/>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <key>SessionCreate</key>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "        <true/>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "    </dict>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                        execSync(`echo "</plist>" >> /Library/LaunchDaemons/org.hoobsd.${id}.plist`);

                        execSync(`launchctl load -w /Library/LaunchDaemons/org.hoobsd.${id}.plist`);
                    }

                    resolve(true);
                } catch (_error) {
                    resolve(false);
                }
            } else if (id === "default") {
                console.log(`${display} instance is already created`);

                resolve(false);
            } else {
                console.log("State must have a unique name, server port and bridge port");

                resolve(false);
            }
        });
    }

    static appendInstance(id: string, display: string, type: string, port: number) {
        const instances: InstanceRecord[] = [];

        for (let i = 0; i < State.instances.length; i += 1) {
            const { ...instance } = State.instances[i];

            if (instance.id === "api") {
                instances.unshift({
                    id: instance.id,
                    type: instance.type,
                    display: instance.display,
                    port: instance.port,
                });
            } else {
                instances.push({
                    id: instance.id,
                    type: instance.type,
                    display: instance.display,
                    port: instance.port,
                });
            }
        }

        if (id === "api") {
            instances.unshift({
                id,
                type,
                display,
                port: parseInt(`${port}`, 10),
            });
        } else {
            instances.push({
                id,
                type,
                display,
                port: parseInt(`${port}`, 10),
            });
        }

        writeFileSync(Paths.instancesPath(), formatJson(instances));
    }

    static createService(name: string, port: number, skip?: boolean): Promise<boolean> {
        return new Promise((resolve) => {
            let type = "";

            if (!skip) {
                type = Instances.initSystem() || "";
            }

            if (!existsSync(Paths.instancesPath())) {
                writeFileSync(Paths.instancesPath(), "[]");
            }

            if (name && port) {
                switch (type) {
                    case "systemd":
                        Instances.createSystemd(name, port).then((success) => {
                            if (success) {
                                Socket.emit(Events.NOTIFICATION, {
                                    instance: "api",
                                    data: {
                                        title: "Instance Added",
                                        description: `Instance "${name} added.`,
                                        type: NotificationType.SUCCESS,
                                        icon: "layers",
                                    },
                                }).then(() => {
                                    Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port);

                                    resolve(true);
                                });
                            } else {
                                Socket.emit(Events.NOTIFICATION, {
                                    instance: "api",
                                    data: {
                                        title: "Instance Not Added",
                                        description: `Unable to create instance "${name}.`,
                                        type: NotificationType.ERROR,
                                    },
                                }).then(() => {
                                    resolve(false);
                                });
                            }
                        });

                        break;

                    case "launchd":
                        Instances.createLaunchd(name, port).then((success) => {
                            if (success) {
                                Socket.emit(Events.NOTIFICATION, {
                                    instance: "api",
                                    data: {
                                        title: "Instance Added",
                                        description: `Instance "${name} added.`,
                                        type: NotificationType.SUCCESS,
                                        icon: "layers",
                                    },
                                }).then(() => {
                                    Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port);

                                    resolve(true);
                                });
                            } else {
                                Socket.emit(Events.NOTIFICATION, {
                                    instance: "api",
                                    data: {
                                        title: "Instance Not Added",
                                        description: `Unable to create instance "${name}.`,
                                        type: NotificationType.ERROR,
                                    },
                                }).then(() => {
                                    resolve(false);
                                });
                            }
                        });

                        break;

                    default:
                        Socket.emit(Events.NOTIFICATION, {
                            instance: "api",
                            data: {
                                title: "Instance Added",
                                description: `Instance "${name} added.`,
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

                            Instances.appendInstance(sanitize(name), name, sanitize(name) === "api" ? "api" : "bridge", port);

                            resolve(true);
                        });

                        break;
                }
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
                ]).then((result) => {
                    if (result && result.name && result.port) {
                        const id = sanitize(result.name);

                        switch (type) {
                            case "systemd":
                                Instances.createSystemd(result.name, result.port).then((success) => {
                                    if (success) {
                                        Socket.emit(Events.NOTIFICATION, {
                                            instance: "api",
                                            data: {
                                                title: "Instance Added",
                                                description: `Instance "${result.name} added.`,
                                                type: NotificationType.SUCCESS,
                                                icon: "layers",
                                            },
                                        }).then(() => {
                                            Instances.appendInstance(id, result.name, id === "api" ? "api" : "bridge", result.port);

                                            resolve(true);
                                        });
                                    } else {
                                        Socket.emit(Events.NOTIFICATION, {
                                            instance: "api",
                                            data: {
                                                title: "Instance Not Added",
                                                description: `Unable to create instance "${result.name}.`,
                                                type: NotificationType.ERROR,
                                            },
                                        }).then(() => {
                                            resolve(false);
                                        });
                                    }
                                });

                                break;

                            case "launchd":
                                Instances.createLaunchd(result.name, result.port).then((success) => {
                                    if (success) {
                                        Socket.emit(Events.NOTIFICATION, {
                                            instance: "api",
                                            data: {
                                                title: "Instance Added",
                                                description: `Instance "${result.name} added.`,
                                                type: NotificationType.SUCCESS,
                                                icon: "layers",
                                            },
                                        }).then(() => {
                                            Instances.appendInstance(id, result.name, id === "api" ? "api" : "bridge", result.port);

                                            resolve(true);
                                        });
                                    } else {
                                        Socket.emit(Events.NOTIFICATION, {
                                            instance: "api",
                                            data: {
                                                title: "Instance Not Added",
                                                description: `Unable to create instance "${result.name}.`,
                                                type: NotificationType.ERROR,
                                            },
                                        }).then(() => {
                                            resolve(false);
                                        });
                                    }
                                });

                                break;

                            default:
                                Socket.emit(Events.NOTIFICATION, {
                                    instance: "api",
                                    data: {
                                        title: "Instance Added",
                                        description: `Instance "${result.name} added.`,
                                        type: NotificationType.SUCCESS,
                                        icon: "layers",
                                    },
                                }).then(() => {
                                    Instances.appendInstance(id, result.name, id === "api" ? "api" : "bridge", result.port);

                                    if (id === "api") {
                                        console.log("api created you can start the api with this command");
                                        console.log(Chalk.yellow(`${join(Instances.locate(), "hoobsd")} api`));
                                    } else {
                                        console.log("instance created you can start the instance with this command");
                                        console.log(Chalk.yellow(`${join(Instances.locate(), "hoobsd")} start --instance '${id}'`));
                                    }

                                    resolve(true);
                                });

                                break;
                        }
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
                    Instances.removeSystemd(instances[i].id);
                    break;

                case "launchd":
                    Instances.removeLaunchd(instances[i].id);
                    break;
            }
        }
    }

    static backup(): Promise<string> {
        return new Promise((resolve, reject) => {
            writeFileSync(join(Paths.storagePath(), "meta"), formatJson({
                date: (new Date()).getTime(),
                type: "full",
                product: "hoobs",
                generator: "hoobs-cli",
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

            if (basename(path) !== "node_modules") {
                if (lstatSync(path).isDirectory()) {
                    archive.directory(path, join(basename(directory), entries[i]));
                } else {
                    archive.file(path, { name: join(basename(directory), entries[i]) });
                }
            }
        }
    }

    static restore(file: string, remove?: boolean, skip?: boolean): Promise<void> {
        return new Promise((resolve) => {
            let type = "";

            if (!skip) {
                type = Instances.initSystem() || "";
            }

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
                        if (State.manager === "yarn") {
                            execSync("yarn install --unsafe-perm --ignore-engines", {
                                cwd: Paths.storagePath(instances[i].id),
                                stdio: "inherit",
                            });
                        } else {
                            execSync("npm install --unsafe-perm", {
                                cwd: Paths.storagePath(instances[i].id),
                                stdio: "inherit",
                            });
                        }
                    }

                    const bridges = instances.filter((item) => item.type === "bridge");

                    for (let i = 0; i < bridges.length; i += 1) {
                        switch (type) {
                            case "systemd":
                                Instances.createSystemd(bridges[i].display, bridges[i].port);
                                break;

                            case "launchd":
                                Instances.createLaunchd(bridges[i].display, bridges[i].port);
                                break;
                        }
                    }

                    const api = instances.find((item) => item.type === "api");

                    if (api) {
                        switch (type) {
                            case "systemd":
                                if (existsSync("/etc/systemd/system/api.hoobsd.service")) {
                                    execSync("systemctl stop api.hoobsd.service");
                                    execSync("systemctl start api.hoobsd.service");
                                } else {
                                    Instances.createSystemd(api.display, api.port);
                                }

                                break;

                            case "launchd":
                                if (existsSync("/Library/LaunchDaemons/org.hoobsd.api.plist")) {
                                    execSync("launchctl unload /Library/LaunchDaemons/org.hoobsd.api.plist");
                                    execSync("launchctl load -w /Library/LaunchDaemons/org.hoobsd.api.plist");
                                } else {
                                    Instances.createLaunchd(api.display, api.port);
                                }

                                break;
                        }
                    }

                    resolve();
                }, 1000);
            });
        });
    }
}
