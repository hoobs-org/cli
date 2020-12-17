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

import { join } from "path";
import { execSync } from "child_process";
import { existsSync } from "fs-extra";
import Semver from "semver";
import Instances from "./instances";
import { Console } from "../logger";
import { parseJson } from "../formatters";

const CACHE: { [key: string]: any } = {};

export default class System {
    static info(): { [key: string]: any } {
        if (CACHE.system) return CACHE.system;

        const results: { [key: string]: any } = {};
        const release = System.command("uname").toLowerCase();

        switch (release) {
            case "darwin":
                results.distribution = ((System.command("sw_vers", true).split("\n").find((item) => item.startsWith("ProductName:")) || "").split(":")[1] || "").trim();
                results.version = ((System.command("sw_vers", true).split("\n").find((item) => item.startsWith("ProductVersion:")) || "").split(":")[1] || "").trim();
                break;

            case "linux":
                results.distribution = ((System.command("cat /etc/*-release", true).split("\n").find((item) => item.startsWith("ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                results.version = ((System.command("cat /etc/*-release", true).split("\n").find((item) => item.startsWith("VERSION_ID=")) || "").split("=")[1] || "").replace(/"/g, "");
                break;
        }

        results.arch = System.command("uname -m");
        results.init_system = Instances.initSystem() || "";

        switch (results.distribution) {
            case "alpine":
                results.package_manager = System.command("command -v apk") !== "" ? "apk" : "";
                break;

            case "ubuntu":
            case "debian":
            case "raspbian":
                results.package_manager = System.command("command -v apt-get") !== "" ? "apt-get" : "";
                break;

            case "fedora":
            case "rhel":
            case "centos":
                if (System.command("command -v dnf") !== "") {
                    results.package_manager = "dnf";
                } else if (System.command("command -v yum") !== "") {
                    results.package_manager = "yum";
                } else {
                    results.package_manager = "";
                }

                break;

            default:
                results.package_manager = "";
        }

        CACHE.system = results;

        return results;
    }

    static command(value: string, multiline?: boolean): string {
        let results = "";

        try {
            results = execSync(value).toString() || "";
        } catch (_error) {
            results = "";
        }

        if (!multiline) results = results.replace(/\n/g, "");

        return results;
    }

    static sync(beta: boolean): void {
        const system = System.info();

        if (system.package_manager) {
            switch (system.distribution) {
                case "alpine":
                    execSync("sed -i -e 's/v[[:digit:]]\\..*\\//edge\\//g' /etc/apk/repositories");
                    execSync("apk upgrade --update-cache --available");
                    break;

                case "ubuntu":
                case "debian":
                case "raspbian":
                    execSync(`curl -sL https://deb.nodesource.com/setup_${beta ? "current" : "lts"}.x | bash`);
                    break;

                case "fedora":
                case "rhel":
                case "centos":
                    execSync(`curl -sL https://rpm.nodesource.com/setup_${beta ? "current" : "lts"}.x | bash`);
                    break;
            }
        }
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

    static get cli(): { [key: string]: any } {
        return {
            info: (beta: boolean): { [key: string]: any } => {
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
                let release = "";
                let download = "";

                if (path !== "") installed = System.command(`${path} -v`);
                if (!Semver.valid(installed)) installed = "";

                const data = System.cli.release(beta);

                release = data.release || "";
                download = data.download || "";

                if ((Semver.valid(installed) && Semver.valid(release) && Semver.gt(installed, release)) || !Semver.valid(release)) {
                    release = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hbs/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                return {
                    cli_prefix: prefix,
                    cli_version: installed,
                    cli_release: release,
                    cli_upgraded: installed === release || mode === "development" ? true : !Semver.gt(release, installed),
                    cli_download: download,
                    cli_mode: mode,
                };
            },

            release: (beta: boolean): { [key: string]: string } => {
                if (!CACHE.cli) CACHE.cli = parseJson<{ [key: string]: any }>(System.command(`curl -sL https://support.hoobs.org/api/releases/hbs/${beta ? "beta" : "latest"}`, true), {}).results || {};

                return {
                    release: CACHE.cli.version || "",
                    download: CACHE.cli.download || "",
                };
            },

            upgrade: (beta: boolean): void => {
                const data = System.cli.info(beta);

                execSync(`curl -sL ${data.cli_download} --output ./hbs.tar.gz`);
                execSync(`tar -xzf ./hbs.tar.gz -C ${data.cli_prefix} --strip-components=1 --no-same-owner`);
                execSync("rm -f ./hbs.tar.gz");

                if (data.cli_mode === "production") {
                    execSync("sudo yarn install --force --production", { cwd: join(data.cli_prefix, "lib/hbs") });
                }
            },
        };
    }

    static get hoobsd(): { [key: string]: any } {
        return {
            info: (beta: boolean): { [key: string]: any } => {
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
                let release = "";
                let download = "";

                if (path !== "") installed = System.command(`${path} -v`);
                if (!Semver.valid(installed)) installed = "";

                const data = System.hoobsd.release(beta);

                release = data.release || "";
                download = data.download || "";

                if ((Semver.valid(installed) && Semver.valid(release) && Semver.gt(installed, release)) || !Semver.valid(release)) {
                    release = installed;
                }

                let mode = "none";

                if (existsSync(`${prefix}lib/hoobsd/package.json`)) mode = "production";
                if (existsSync(`${prefix}/package.json`)) mode = "development";

                return {
                    hoobsd_prefix: prefix,
                    hoobsd_version: installed,
                    hoobsd_release: release,
                    hoobsd_upgraded: installed === release || mode === "development" ? true : !Semver.gt(release, installed),
                    hoobsd_download: download,
                    hoobsd_mode: mode,
                    hoobsd_running: System.hoobsd.running(),
                };
            },

            running: (): boolean => {
                if (System.command("pidof hoobsd") !== "") return true;

                return false;
            },

            release: (beta: boolean): { [key: string]: string } => {
                if (!CACHE.hoobsd) CACHE.hoobsd = parseJson<{ [key: string]: any }>(System.command(`curl -sL https://support.hoobs.org/api/releases/hoobsd/${beta ? "beta" : "latest"}`, true), {}).results || {};

                return {
                    release: CACHE.hoobsd.version || "",
                    download: CACHE.hoobsd.download || "",
                };
            },

            upgrade: (beta: boolean): void => {
                const data = System.hoobsd.info(beta);

                execSync(`curl -sL ${data.hoobsd_download} --output ./hoobsd.tar.gz`);
                execSync(`tar -xzf ./hoobsd.tar.gz -C ${data.hoobsd_prefix} --strip-components=1 --no-same-owner`);
                execSync("rm -f ./hoobsd.tar.gz");

                if (data.hoobsd_mode === "production") {
                    execSync("sudo yarn install --force --production", { cwd: join(data.hoobsd_prefix, "lib/hoobsd") });
                }
            },
        };
    }

    static get runtime(): { [key: string]: any } {
        return {
            info: (beta: boolean): { [key: string]: any } => {
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
                let release = "";

                if (path !== "") installed = System.command(`${path} -v`).replace("v", "");
                if (!Semver.valid(installed)) installed = "";

                release = System.runtime.release(beta);

                if ((Semver.valid(installed) && Semver.valid(release) && Semver.gt(installed, release)) || !Semver.valid(release)) {
                    release = installed;
                }

                return {
                    node_prefix: path !== "" ? path.replace("bin/node", "") : "",
                    node_version: installed,
                    node_release: release,
                    node_upgraded: installed === release || release === "" || installed === "" ? true : !Semver.gt(release, installed),
                };
            },

            release: (beta: boolean): string => {
                const system = System.info();

                let data: any = "";

                if (system.package_manager) {
                    switch (system.distribution) {
                        case "alpine":
                            data = System.command("apk version nodejs");
                            data = data.split("\n");
                            data = data[data.length - 1];
                            data = data.split("=");
                            data = (data[data.length - 1] || "").trim();
                            data = data.split("-")[0] || "";

                            return data || "";

                        case "ubuntu":
                        case "debian":
                        case "raspbian":
                            data = System.command("apt-cache show nodejs | grep Version");
                            data = data.split("\n")[0] || "";
                            data = (data.split(":")[1] || "").trim();
                            data = (data.split(/[-~]+/)[0] || "").trim();

                            return data || "";

                        case "fedora":
                        case "rhel":
                        case "centos":
                            data = System.command(`${system.package_manager} info nodejs | grep Version`);
                            data = data.split("\n")[1] || "";
                            data = (data.split(":")[1] || "").trim();

                            return data || "";
                    }
                }

                if (!CACHE.node) CACHE.node = parseJson<{ [key: string]: any }>(System.command(`curl -sL https://support.hoobs.org/api/releases/node/${beta ? "beta" : "latest"}`, true), {}).results || {};

                return CACHE.node.version || "";
            },

            upgrade: (beta: boolean): void => {
                const system = System.info();
                const release = System.runtime.release(beta);

                if (system.package_manager) {
                    switch (system.distribution) {
                        case "alpine":
                            execSync("apk update");
                            execSync("apk add curl tar git python3 make gcc g++ nodejs yarn");
                            break;

                        case "ubuntu":
                        case "debian":
                        case "raspbian":
                            execSync("apt-get update");
                            execSync("apt-get install -y curl tar git python3 make gcc g++ nodejs yarn");
                            break;

                        case "fedora":
                        case "rhel":
                        case "centos":
                            execSync(`${system.package_manager} update -y curl tar git policycoreutils python3 make gcc gcc-c++ nodejs yarnpkg`);
                            break;

                        case "macos":
                            execSync(`curl -sL https://nodejs.org/dist/v${release}/node-v${release}.pkg --output ./node.pkg`);
                            execSync("installer -pkg ./node.pkg -target /");
                            execSync("rm -f ./node.pkg");
                            break;

                        default:
                            Console.error(`unsupported distribution "${system.distribution}", node must be installed manually.`);
                            break;
                    }
                } else {
                    Console.error("unknown package manager, node must be installed manually.");
                }
            },
        };
    }
}
