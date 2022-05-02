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

/* eslint-disable no-template-curly-in-string */
/* eslint-disable prefer-destructuring */

import Path from "path";
import { spawn, execSync } from "child_process";

import {
    existsSync,
    readFileSync,
    writeFileSync,
    unlinkSync,
} from "fs-extra";

import Semver from "semver";
import ReadLines from "n-readlines";
import State from "../state";
import Paths from "./paths";

const CACHE: { [key: string]: any } = {};

export default class System {
    static get platform(): string {
        if (existsSync("/proc/1/cgroup") && System.shell("cat /proc/1/cgroup | grep 'docker\\|lxc'") !== "") return "docker";

        return <string>process.platform;
    }

    static info(): { [key: string]: any } {
        if (CACHE.system) return CACHE.system;

        const results: { [key: string]: any } = {};
        const release = System.shell("uname").toLowerCase();

        switch (release) {
            case "darwin":
                results.distribution = ((System.shell("sw_vers", true).split("\n").find((item) => item.startsWith("ProductName:")) || "").split(":")[1] || "").trim();
                results.version = ((System.shell("sw_vers", true).split("\n").find((item) => item.startsWith("ProductVersion:")) || "").split(":")[1] || "").trim();
                break;

            case "linux":
                results.distribution = ((System.shell("cat /etc/*-release", true).split("\n").find((item) => item.startsWith("ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                results.version = ((System.shell("cat /etc/*-release", true).split("\n").find((item) => item.startsWith("VERSION_ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                break;
        }

        results.arch = System.shell("uname -m");
        results.init_system = "";
        results.repo = "stable";

        if (existsSync("/etc/systemd/system")) results.init_system = "systemd";
        if (existsSync("/Library/LaunchDaemons/")) results.init_system = "launchd";
        if (!existsSync("/proc/version") || (existsSync("/proc/version") && System.shell("cat /proc/version | grep microsoft") !== "")) results.init_system = "";

        switch (results.distribution) {
            case "alpine":
                results.package_manager = System.shell("command -v apk") !== "" ? "apk" : "";
                break;

            case "ubuntu":
            case "debian":
            case "raspbian":
                results.package_manager = System.shell("command -v apt-get") !== "" ? "apt-get" : "";

                if (existsSync("/etc/apt/sources.list.d/hoobs.list")) {
                    const match = System.grep("/etc/apt/sources.list.d/hoobs.list", "bleeding", "edge");

                    if (match && match.indexOf("edge")) {
                        results.repo = "edge";
                    } else if (match && match.indexOf("bleeding")) {
                        results.repo = "bleeding";
                    }
                }

                if (results.package_manager === "apt-get") execSync("apt-get update --allow-releaseinfo-change", { stdio: "ignore" });

                break;

            case "fedora":
            case "rhel":
            case "centos":
                if (System.shell("command -v dnf") !== "") {
                    results.package_manager = "dnf";
                } else if (System.shell("command -v yum") !== "") {
                    results.package_manager = "yum";
                } else {
                    results.package_manager = "";
                }

                break;

            default:
                results.package_manager = "";
        }

        results.mdns = false;
        results.mdns_broadcast = "";
        results.product = "";
        results.model = "";
        results.sku = "";

        if (existsSync("/etc/hoobs")) {
            const data = System.shell("cat /etc/hoobs", true).split("\n");

            for (let i = 0; i < data.length; i += 1) {
                const field = data[i].split("=");

                if (field[0] === "ID") results.product = field[1];
                if (field[0] === "MODEL") results.model = field[1];
                if (field[0] === "SKU") results.sku = field[1];
            }
        }

        if ((results.product === "box" || results.product === "card") && results.init_system === "systemd" && existsSync("/etc/avahi/avahi-daemon.conf")) {
            let broadcast = System.shell("cat /etc/avahi/avahi-daemon.conf | grep host-name=");

            if (broadcast.indexOf("#") >= 0) {
                broadcast = (System.shell("hostname").split(".")[0] || "").toLowerCase();
            } else {
                broadcast = (broadcast.split("=")[1] || "").toLowerCase();
            }

            results.mdns = true;
            results.mdns_broadcast = broadcast;
        }

        CACHE.system = results;

        return results;
    }

    static async hostname(value: string) {
        const system = System.info();

        if (system.mdns) {
            let formatted = value || "";

            formatted = formatted.replace("https://", "");
            formatted = formatted.replace("http://", "");
            formatted = formatted.replace(/ /g, "-");
            formatted = formatted.split(".")[0];

            if (formatted && formatted !== "" && formatted !== system.mdns_broadcast) {
                const broadcast = System.shell("cat /etc/avahi/avahi-daemon.conf | grep host-name=");
                const content = readFileSync("/etc/avahi/avahi-daemon.conf").toString();

                writeFileSync("/etc/avahi/avahi-daemon.conf", content.replace(broadcast, `host-name=${formatted}`));

                System.shell("systemctl restart avahi-daemon");
            }
        }
    }

    static shell(command: string, multiline?: boolean): string {
        let results = "";

        try {
            results = execSync(command).toString() || "";
        } catch (_error) {
            results = "";
        }

        if (!multiline) results = results.replace(/\n/g, "");

        return results;
    }

    static execute(command: string, ...flags: string[]): Promise<void> {
        return new Promise((resolve) => {
            const proc = spawn(command, flags, { detached: true, stdio: ["ignore", "ignore", "ignore"] });

            proc.on("close", () => {
                resolve();
            });
        });
    }

    static grep(file: string, ...search: string[]) {
        if (!existsSync(file)) return undefined;

        const reader = new ReadLines(file);
        const expression = new RegExp(`(${search.join("|")})`);

        let line: false | Buffer = reader.next();

        while (line) {
            if (line.toString().match(expression)) return line.toString();

            line = reader.next();
        }

        return undefined;
    }

    static async upgrade(...components: string[]): Promise<void> {
        const system = System.info();

        if (State.mode === "production" && system.package_manager === "apt-get" && components.length > 0) {
            await System.execute("apt-get", "update");
            await System.execute("apt-get", "install", "-y", ...components);
        }
    }

    static restart(): void {
        if (State.mode === "production") {
            let path = "/usr/bin/hoobsd";

            const paths = (process.env.PATH || "").split(":");

            for (let i = 0; i < paths.length; i += 1) {
                if (paths[i].indexOf("/tmp/") === -1 && existsSync(Path.join(paths[i], "hoobsd"))) {
                    path = Path.join(paths[i], "hoobsd");

                    break;
                }
            }

            if (existsSync(path)) path = "";

            if (existsSync(path)) setTimeout(() => execSync(`${path} service restart`), 3 * 1000);
        }
    }

    static switch(manager: string, level: string): void {
        switch (manager) {
            case "apt-get":
                if (State.mode === "production") execSync(`wget -qO- https://dl.hoobs.org/${level || "stable"} | bash -`, { stdio: "ignore" });

                break;
        }
    }

    static resetAuthentication() {
        if (existsSync("/var/lib/hoobs/access")) unlinkSync("/var/lib/hoobs/access");
    }

    static get gui(): { [key: string]: any } {
        return {
            info: (): { [key: string]: any } => {
                let path: string | undefined = "/usr/lib/hoobs";
                let installed: string | undefined = "";

                if (!existsSync(Path.join(path, "package.json"))) path = "/usr/local/lib/hoobs";
                if (!existsSync(Path.join(path, "package.json"))) path = Path.join(__dirname, "../../../../gui");
                if (!existsSync(Path.join(path, "package.json"))) path = undefined;
                if (path) installed = (Paths.loadJson<{ [key: string]: any }>(Path.join(path, "package.json"), {})).version || "";
                if (!Semver.valid(installed)) installed = undefined;

                let current = System.gui.release() || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed || "", current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (path === "/usr/lib/hoobs" || path === "/usr/local/lib/hoobs") mode = "production";
                if (path === Path.join(__dirname, "../../../../gui")) mode = "development";

                const results = {
                    gui_prefix: "/usr/",
                    gui_version: installed,
                    gui_current: current,
                    gui_upgraded: !Semver.gt(current, installed || ""),
                    gui_mode: mode,
                };

                return results;
            },

            release: (): string => {
                const system = System.info();

                if (system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show hoobs-gui | grep Version", true);
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();

                    return Semver.valid(data) ? data : "";
                }

                return "";
            },

            components: [
                "hoobs-gui",
            ],
        };
    }

    static get cli(): { [key: string]: any } {
        return {
            info: (): { [key: string]: any } => {
                let path = "/usr/bin/hbs";
                let prefix = "/usr/";

                if (State.mode === "development") {
                    path = Path.join(Path.resolve(Paths.application), "debug");
                    prefix = Path.resolve(Paths.application);
                } else {
                    const paths = (process.env.PATH || "").split(":");

                    for (let i = 0; i < paths.length; i += 1) {
                        if (paths[i].indexOf("/tmp/") === -1 && existsSync(Path.join(paths[i], "hbs"))) {
                            path = Path.join(paths[i], "hbs");

                            break;
                        }
                    }

                    if (!existsSync(path)) path = "";
                    if (path !== "") prefix = path.replace("bin/hbs", "");
                }

                let installed = "";

                if (path !== "") installed = System.shell(`${path} -v`, true);
                if (installed && installed !== "") installed = installed.trim().split("\n").pop() || "";
                if (!Semver.valid(installed)) installed = "";

                let current = System.cli.release() || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed, current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hbs/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                return {
                    cli_prefix: prefix,
                    cli_version: installed,
                    cli_current: current,
                    cli_upgraded: Semver.valid(installed) && Semver.valid(current) ? !Semver.gt(current, installed) : true,
                    cli_mode: mode,
                };
            },

            release: (): string => {
                const system = System.info();

                if (system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show hoobs-cli | grep Version", true);
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();

                    return Semver.valid(data) ? data : "";
                }

                return "";
            },

            components: [
                "hoobs-cli",
            ],
        };
    }

    static get hoobsd(): { [key: string]: any } {
        return {
            info: (): { [key: string]: any } => {
                let path = "/usr/bin/hoobsd";
                let prefix = "/usr/";

                if (State.mode === "development") {
                    path = Path.join(Path.resolve(Path.join(Paths.application, "../hoobsd")), "debug");
                    prefix = Path.resolve(Path.join(Paths.application, "../hoobsd"));
                } else {
                    const paths = (process.env.PATH || "").split(":");

                    for (let i = 0; i < paths.length; i += 1) {
                        if (paths[i].indexOf("/tmp/") === -1 && existsSync(Path.join(paths[i], "hoobsd"))) {
                            path = Path.join(paths[i], "hoobsd");

                            break;
                        }
                    }

                    if (!existsSync(path)) path = "";
                    if (path !== "") prefix = path.replace("bin/hoobsd", "");
                }

                let installed = "";

                if (path !== "") installed = System.shell(`${path} -v`, true);
                if (installed && installed !== "") installed = installed.trim().split("\n").pop() || "";
                if (!Semver.valid(installed)) installed = "";

                let current = System.hoobsd.release() || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed, current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hoobsd/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                return {
                    hoobsd_prefix: prefix,
                    hoobsd_version: installed,
                    hoobsd_current: current,
                    hoobsd_upgraded: Semver.valid(installed) && Semver.valid(current) ? !Semver.gt(current, installed) : true,
                    hoobsd_mode: mode,
                    hoobsd_running: System.shell("command -v pidof") !== "" && System.shell("pidof hoobsd") !== "",
                };
            },

            release: (): string => {
                const system = System.info();

                if (system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show hoobsd | grep Version", true);
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();

                    return Semver.valid(data) ? data : "";
                }

                return "";
            },

            components: [
                "hoobsd",
            ],
        };
    }

    static get runtime(): { [key: string]: any } {
        return {
            info: (): { [key: string]: any } => {
                let path = "/usr/bin/node";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(Path.join(paths[i], "node"))) {
                        path = Path.join(paths[i], "node");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";

                let current = System.runtime.release();

                if ((Semver.valid(current) && Semver.gt(process.version.replace("v", ""), current)) || !Semver.valid(current)) {
                    current = process.version.replace("v", "");
                }

                return {
                    node_prefix: path !== "" ? path.replace("bin/node", "") : "",
                    node_current: current,
                    node_upgraded: !Semver.gt(current, process.version.replace("v", "")),
                };
            },

            release: (): string => {
                const system = System.info();

                if (system.package_manager === "apt-get") {
                    let data: any = "";

                    data = System.shell("apt-cache show nodejs | grep Version | grep nodesource", true);
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();
                    data = (data.split(/[-~]+/)[0] || "").trim();

                    return Semver.valid(data) ? data : "";
                }

                return "";
            },

            components: [
                "curl",
                "tar",
                "git",
                "python3",
                "make",
                "gcc",
                "g++",
                "nodejs",
            ],
        };
    }
}
