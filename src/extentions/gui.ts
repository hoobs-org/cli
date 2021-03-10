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

import { removeSync } from "fs-extra";
import { execSync } from "child_process";
import { uname, Utsname } from "node-uname";
import System from "../system";
import Releases from "../system/releases";

export default class GUI {
    static async enable(): Promise<{ success: boolean, error?: string | undefined }> {
        const release = await Releases.fetch("gui");

        if (release) {
            const utsname: Utsname = uname();
            const system = System.info();

            if ((utsname.sysname || "").toLowerCase() === "linux" && system.package_manager === "apt-get") {
                execSync("apt-get update", { stdio: "ignore" });
                execSync("apt-get install -y hoobs-gui", { stdio: "ignore" });

                return {
                    success: true,
                };
            }

            return {
                success: false,
                error: "not linux",
            };
        }

        return {
            success: false,
            error: "mal-formed release",
        };
    }

    static disable(): { success: boolean, error?: string | undefined } {
        const utsname: Utsname = uname();

        if ((utsname.sysname || "").toLowerCase() === "linux") {
            console.log("removing gui");

            removeSync("/usr/lib/hoobs");

            return {
                success: true,
            };
        }

        return {
            success: false,
            error: "not linux",
        };
    }
}
