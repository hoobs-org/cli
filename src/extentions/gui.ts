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
import { execSync, ExecSyncOptions } from "child_process";
import { join, basename } from "path";
import { uname, Utsname } from "node-uname";
import Paths from "../system/paths";
import Releases from "../system/releases";

export default class GUI {
    static enable(): Promise<{ success: boolean, error?: string | undefined }> {
        return new Promise((resolve) => {
            const release: { [key: string]: any } = Releases.fetch("gui");

            if (release) {
                const options: ExecSyncOptions = {
                    cwd: join(Paths.data(), ".."),
                    stdio: ["inherit", "inherit", "inherit"],
                };

                const utsname: Utsname = uname();

                if ((utsname.sysname || "").toLowerCase() === "linux") {
                    execSync(`wget ${release.download}`, options);
                    execSync(`tar -xzf ./${basename(release.download)} -C /usr --strip-components=1 --no-same-owner`, options);
                    execSync(`rm -f ./${basename(release.download)}`, options);

                    resolve({
                        success: true,
                    });
                } else {
                    resolve({
                        success: false,
                        error: "not linux",
                    });
                }
            } else {
                resolve({
                    success: false,
                    error: "unable to fetch release",
                });
            }
        });
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
