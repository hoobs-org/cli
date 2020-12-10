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

import { execSync } from "child_process";
import { existsSync } from "fs-extra";
import { join } from "path";
import Instances from "./instances";
import { Console } from "../logger";

export default class System {
    static info(): { [key: string]: any } {
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
        results.init_system = Instances.initSystem();

        if (existsSync("/usr/local/bin/node")) {
            results.node_prefix = "/usr/local/";
        } else if (existsSync("/usr/bin/node")) {
            results.node_prefix = "/usr/";
        } else {
            results.node_prefix = null;
        }

        results.node_version = results.node_prefix !== "" ? System.command(`${join(results.node_prefix, "bin", "node")} -v`).replace("v", "") : null;
        results.hoobsd_running = System.running();

        switch (results.distribution) {
            case "alpine":
                results.package_manager = System.command("command -v apk") !== "" ? "apk" : null;
                break;

            case "ubuntu":
            case "debian":
            case "raspbian":
                results.package_manager = System.command("command -v apt-get") !== "" ? "apt-get" : null;
                break;

            case "fedora":
            case "rhel":
            case "centos":
                if (System.command("command -v dnf") !== "") {
                    results.package_manager = "dnf";
                } else if (System.command("command -v yum") !== "") {
                    results.package_manager = "yum";
                } else {
                    results.package_manager = null;
                }

                break;

            default:
                results.package_manager = null;
        }

        return results;
    }

    static running(): boolean {
        if (System.command("pidof hoobsd") !== "") {
            return true;
        }

        return false;
    }

    static command(value: string, multiline?: boolean): string {
        let results = "";

        try {
            results = execSync(value).toString() || "";
        } catch (_error) {
            results = "";
        }

        if (!multiline) {
            results = results.replace(/\n/g, "");
        }

        return results;
    }

    static runtime(): { [key: string]: any } {
        const system = System.info();

        if (system.package_manager) {
            switch (system.distribution) {
                case "alpine":
                    execSync("sed -i -e 's/v[[:digit:]]\\..*\\//edge\\//g' /etc/apk/repositories", { stdio: "inherit" });
                    execSync(`${system.distribution} upgrade --update-cache --available`, { stdio: "inherit" });
                    execSync(`${system.distribution} update`, { stdio: "inherit" });
                    execSync(`${system.distribution} add nodejs`, { stdio: "inherit" });
                    break;

                case "ubuntu":
                case "debian":
                case "raspbian":
                    switch (system.arch) {
                        case "x86_64":
                        case "amd64":
                        case "armv7l":
                        case "armhf":
                        case "arm64":
                            execSync("curl -sL https://deb.nodesource.com/setup_lts.x | bash -", { stdio: "inherit" });
                            execSync(`${system.distribution} update`, { stdio: "inherit" });
                            execSync(`${system.distribution} install -y build-essential nodejs`, { stdio: "inherit" });
                            break;

                        default:
                            Console.error(`unsupported architecture "${system.arch}", node must be installed manually.`);
                            break;
                    }

                    break;

                case "fedora":
                case "rhel":
                case "centos":
                    execSync("curl -sL https://rpm.nodesource.com/setup_lts.x | bash -", { stdio: "inherit" });
                    execSync(`${system.distribution} install -y gcc-c++ make nodejs`, { stdio: "inherit" });
                    break;

                default:
                    Console.error(`unsupported distribution "${system.distribution}", node must be installed manually.`);
                    break;
            }
        } else {
            Console.error("unknown package manager, node must be installed manually.");
        }

        return System.info();
    }
}
