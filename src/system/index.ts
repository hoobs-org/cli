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

import { join } from "path";
import { exec, execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs-extra";
import Semver from "semver";
import Releases from "./releases";
import { loadJson } from "../formatters";

const CACHE: { [key: string]: any } = {};

export default class System {
    static async info(): Promise<{ [key: string]: any }> {
        if (CACHE.system) return CACHE.system;

        const results: { [key: string]: any } = {};
        const release = (await System.shell("uname")).toLowerCase();

        switch (release) {
            case "darwin":
                results.distribution = (((await System.shell("sw_vers", true)).split("\n").find((item) => item.startsWith("ProductName:")) || "").split(":")[1] || "").trim();
                results.version = (((await System.shell("sw_vers", true)).split("\n").find((item) => item.startsWith("ProductVersion:")) || "").split(":")[1] || "").trim();
                break;

            case "linux":
                results.distribution = (((await System.shell("cat /etc/*-release", true)).split("\n").find((item) => item.startsWith("ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                results.version = (((await System.shell("cat /etc/*-release", true)).split("\n").find((item) => item.startsWith("VERSION_ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                break;
        }

        results.arch = await System.shell("uname -m");
        results.init_system = "";

        if (existsSync("/etc/systemd/system")) results.init_system = "systemd";
        if (existsSync("/Library/LaunchDaemons/")) results.init_system = "launchd";
        if (await System.shell("cat /proc/version | grep microsoft") !== "") results.init_system = "";

        switch (results.distribution) {
            case "alpine":
                results.package_manager = (await System.shell("command -v apk")) !== "" ? "apk" : "";
                break;

            case "ubuntu":
            case "debian":
            case "raspbian":
                results.package_manager = (await System.shell("command -v apt-get")) !== "" ? "apt-get" : "";
                break;

            case "fedora":
            case "rhel":
            case "centos":
                if ((await System.shell("command -v dnf")) !== "") {
                    results.package_manager = "dnf";
                } else if ((await System.shell("command -v yum")) !== "") {
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
            const data = (await System.shell("cat /etc/hoobs", true)).split("\n");

            for (let i = 0; i < data.length; i += 1) {
                const field = data[i].split("=");

                if (field[0] === "ID") results.product = field[1];
                if (field[0] === "MODEL") results.model = field[1];
                if (field[0] === "SKU") results.sku = field[1];
            }
        }

        if ((results.product === "box" || results.product === "card") && results.init_system === "systemd" && existsSync("/etc/avahi/avahi-daemon.conf")) {
            let broadcast = await System.shell("cat /etc/avahi/avahi-daemon.conf | grep host-name=");

            if (broadcast.indexOf("#") >= 0) {
                broadcast = ((await System.shell("hostname")).split(".")[0] || "").toLowerCase();
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
        const system = await System.info();

        if (system.mdns) {
            let formatted = value || "";

            formatted = formatted.replace("https://", "");
            formatted = formatted.replace("http://", "");
            formatted = formatted.replace(/ /g, "-");
            formatted = formatted.split(".")[0];

            if (formatted && formatted !== "" && formatted !== system.mdns_broadcast) {
                const broadcast = await System.shell("cat /etc/avahi/avahi-daemon.conf | grep host-name=");
                const content = readFileSync("/etc/avahi/avahi-daemon.conf").toString();

                writeFileSync("/etc/avahi/avahi-daemon.conf", content.replace(broadcast, `host-name=${formatted}`));

                await System.shell("systemctl restart avahi-daemon");
            }
        }
    }

    static shell(command: string, multiline?: boolean): Promise<string> {
        return new Promise((resolve) => {
            exec(command, (error, stdout) => {
                if (error) {
                    resolve("");
                } else if (!multiline) {
                    resolve((stdout || "").replace(/\n/g, ""));
                } else {
                    resolve(stdout || "");
                }
            });
        });
    }

    static shellSync(command: string, multiline?: boolean): string {
        let results = "";

        try {
            results = execSync(command).toString() || "";
        } catch (_error) {
            results = "";
        }

        if (!multiline) results = results.replace(/\n/g, "");

        return results;
    }

    static restart(): void {
        let path = "/usr/bin/hoobsd";

        const paths = (process.env.PATH || "").split(":");

        for (let i = 0; i < paths.length; i += 1) {
            if (paths[i].indexOf("/tmp/") === -1 && existsSync(join(paths[i], "hoobsd"))) {
                path = join(paths[i], "hoobsd");

                break;
            }
        }

        if (existsSync(path)) path = "";

        execSync(`${path} service restart`);
    }

    static get gui(): { [key: string]: any } {
        return {
            info: async (beta: boolean): Promise<{ [key: string]: any }> => {
                let path: string | undefined = "/usr/lib/hoobs";
                let installed: string | undefined = "";

                if (!existsSync(join(path, "package.json"))) path = join(__dirname, "../../../../gui");
                if (!existsSync(join(path, "package.json"))) path = undefined;
                if (path) installed = (loadJson<{ [key: string]: any }>(join(path, "package.json"), {})).version || "";
                if (!Semver.valid(installed)) installed = undefined;

                const release = await System.gui.release(beta);
                const download = release.download || "";

                let current = release.version || "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed || "", current)) || !Semver.valid(current)) {
                    current = installed;
                }

                let mode = "none";

                if (path === "/usr/lib/hoobs") mode = "production";
                if (path === join(__dirname, "../../../../gui")) mode = "development";

                const results = {
                    gui_prefix: "/usr/",
                    gui_version: installed,
                    gui_current: current,
                    gui_upgraded: (installed || current) === current ? true : !Semver.gt(current, installed || ""),
                    gui_download: download,
                    gui_mode: mode,
                };

                return results;
            },

            release: async (beta: boolean): Promise<{ [key: string]: string }> => {
                const release = await Releases.fetch("gui", beta) || {};

                return {
                    version: release.version || "",
                    download: release.download || "",
                };
            },

            upgrade: async (): Promise<void> => {
                const system = await System.info();

                if (system.package_manager === "apt-get") {
                    execSync("apt-get update", { stdio: "ignore" });
                    execSync("apt-get install -y hoobs-gui", { stdio: "ignore" });
                }
            },
        };
    }

    static get cli(): { [key: string]: any } {
        return {
            info: async (beta: boolean): Promise<{ [key: string]: any }> => {
                let path = "/usr/bin/hbs";
                let prefix = "/usr/";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(join(paths[i], "hbs"))) {
                        path = join(paths[i], "hbs");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";
                if (path !== "") prefix = path.replace("bin/hbs", "");

                let installed = "";

                if (path !== "") installed = await System.shell(`${path} -v`, true);
                if (installed && installed !== "") installed = installed.trim().split("\n").pop() || "";
                if (!Semver.valid(installed)) installed = "";

                const release = await System.cli.release(beta);
                const download = release.download || "";

                let current = release.version || "";

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
                    cli_upgraded: installed === current || mode === "development" ? true : !Semver.gt(current, installed),
                    cli_download: download,
                    cli_mode: mode,
                };
            },

            release: async (beta: boolean): Promise<{ [key: string]: string }> => {
                const release = await Releases.fetch("hbs", beta) || {};

                return {
                    version: release.version || "",
                    download: release.download || "",
                };
            },

            upgrade: async (): Promise<void> => {
                const system = await System.info();

                if (system.package_manager === "apt-get") {
                    execSync("apt-get update", { stdio: "ignore" });
                    execSync("apt-get install -y hoobs-cli", { stdio: "ignore" });
                }
            },
        };
    }

    static get hoobsd(): { [key: string]: any } {
        return {
            info: async (beta: boolean): Promise<{ [key: string]: any }> => {
                let path = "/usr/bin/hoobsd";
                let prefix = "/usr/";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(join(paths[i], "hoobsd"))) {
                        path = join(paths[i], "hoobsd");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";
                if (path !== "") prefix = path.replace("bin/hoobsd", "");

                let installed = "";

                if (path !== "") installed = await System.shell(`${path} -v`, true);
                if (installed && installed !== "") installed = installed.trim().split("\n").pop() || "";
                if (!Semver.valid(installed)) installed = "";

                const release = await System.hoobsd.release(beta);
                const download = release.download || "";

                let current = release.version || "";

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
                    hoobsd_upgraded: installed === current || mode === "development" ? true : !Semver.gt(current, installed),
                    hoobsd_download: download,
                    hoobsd_mode: mode,
                    hoobsd_running: (await System.shell("pidof hoobsd")) !== "",
                };
            },

            release: async (beta: boolean): Promise<{ [key: string]: string }> => {
                const release = await Releases.fetch("hoobsd", beta) || {};

                return {
                    version: release.version || "",
                    download: release.download || "",
                };
            },

            upgrade: async (): Promise<void> => {
                const system = await System.info();

                if (system.package_manager === "apt-get") {
                    execSync("apt-get update", { stdio: "ignore" });
                    execSync("apt-get install -y hoobsd", { stdio: "ignore" });
                }
            },
        };
    }

    static get runtime(): { [key: string]: any } {
        return {
            info: async (beta: boolean): Promise<{ [key: string]: any }> => {
                let path = "/usr/bin/node";

                const paths = (process.env.PATH || "").split(":");

                for (let i = 0; i < paths.length; i += 1) {
                    if (paths[i].indexOf("/tmp/") === -1 && existsSync(join(paths[i], "node"))) {
                        path = join(paths[i], "node");

                        break;
                    }
                }

                if (!existsSync(path)) path = "";

                let installed = "";
                let current = await System.runtime.release(beta);

                if (path !== "") installed = (await System.shell(`${path} -v`)).replace("v", "");
                if (!Semver.valid(installed)) installed = "";

                if ((Semver.valid(installed) && Semver.valid(current) && Semver.gt(installed, current)) || !Semver.valid(current)) {
                    current = installed;
                }

                return {
                    node_prefix: path !== "" ? path.replace("bin/node", "") : "",
                    node_version: installed,
                    node_current: current,
                    node_upgraded: installed === current || current === "" || installed === "" ? true : !Semver.gt(current, installed),
                };
            },

            release: async (beta: boolean): Promise<string> => {
                const system = await System.info();

                if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get") {
                    execSync(`curl -sL https://deb.nodesource.com/setup_${beta ? "current" : "lts"}.x | bash`, { stdio: "ignore" });

                    let data: any = "";

                    data = await System.shell("apt-cache show nodejs | grep Version");
                    data = data.split("\n")[0] || "";
                    data = (data.split(":")[1] || "").trim();
                    data = (data.split(/[-~]+/)[0] || "").trim();

                    return data || "";
                }

                const release = await Releases.fetch("node", beta) || {};

                return release.version || "";
            },

            upgrade: async (): Promise<void> => {
                const system = await System.info();

                if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get") {
                    execSync("apt-get update", { stdio: "ignore" });
                    execSync("apt-get install -y curl tar git python3 make gcc g++ nodejs yarn", { stdio: "ignore" });
                }
            },
        };
    }
}
