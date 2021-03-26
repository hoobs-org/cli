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

import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs-extra";

import State from "../state";
import Plugins from "./index";
import Paths from "../system/paths";

export default class Sidecar {
    static install(identifier: string, name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const flags = [];

            flags.push("add");
            flags.push("--unsafe-perm");
            flags.push("--ignore-engines");
            flags.push(`${name}@latest`);

            const proc = spawn(Paths.yarn, flags, {
                cwd: Paths.data(State.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", async () => {
                if (existsSync(join(join(Plugins.directory, name), "package.json"))) {
                    const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(State.id), "sidecars.json"), {});

                    sidecars[identifier] = name;

                    Paths.saveJson(join(Paths.data(State.id), "sidecars.json"), sidecars, true);
                    resolve();
                } else {
                    reject();
                }
            });
        });
    }

    static uninstall(identifier: string, name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const flags = [];

            flags.push("remove");
            flags.push(name);

            const proc = spawn(Paths.yarn, flags, {
                cwd: Paths.data(State.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", () => {
                if (!existsSync(join(Plugins.directory, name, "package.json"))) {
                    const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(State.id), "sidecars.json"), {});

                    delete sidecars[identifier];

                    Paths.saveJson(join(Paths.data(State.id), "sidecars.json"), sidecars, true);
                    resolve();
                } else {
                    reject();
                }
            });
        });
    }

    static upgrade(identifier: string, name: string): Promise<void> {
        return new Promise((resolve) => {
            const flags = [];

            if (existsSync(join(Paths.data(State.id), "node_modules", name))) {
                flags.push("upgrade");
            } else {
                flags.push("add");
                flags.push("--unsafe-perm");
            }

            flags.push("--ignore-engines");
            flags.push(`${name}@latest`);

            const proc = spawn(Paths.yarn, flags, {
                cwd: Paths.data(State.id),
                stdio: ["inherit", "inherit", "inherit"],
            });

            proc.on("close", () => {
                const sidecars = Paths.loadJson<{ [key: string]: string }>(join(Paths.data(State.id), "sidecars.json"), {});

                sidecars[identifier] = name;

                Paths.saveJson(join(Paths.data(State.id), "sidecars.json"), sidecars, true);
                resolve();
            });
        });
    }
}
