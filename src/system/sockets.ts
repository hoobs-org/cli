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

import { exec } from "child_process";
import Paths from "./paths";

export default class Sockets {
    static list(): Promise<{ [key: string]: any }[]> {
        return new Promise((resolve) => {
            exec(`lsof | grep '${Paths.storagePath()}'`, (error, output) => {
                const results: { [key: string]: any }[] = [];

                if (error) {
                    return resolve(results);
                }

                const lines = output.split("\n");

                for (let i = 0; i < lines.length; i += 1) {
                    if (lines[i] !== "") {
                        const fields = lines[i].split("  ").map((item) => (item || "").trim()).filter((item) => item !== "");

                        let type = "general";

                        if (fields.length >= 5) {
                            if (fields[4].toLowerCase().startsWith("unix")) {
                                type = "ipc";
                            } else if (fields[4].toLowerCase().startsWith("dir")) {
                                type = "watcher";
                            }
                        }

                        results.push({
                            pid: fields.length >= 2 ? fields[1] : null,
                            type,
                            user: fields.length >= 3 ? fields[2] : null,
                            path: fields.length >= 7 ? fields[6] : null,
                        });
                    }
                }

                return resolve(results);
            });
        });
    }
}
