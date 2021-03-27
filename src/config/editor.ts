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

import { join } from "path";
import { spawn } from "child_process";
import { unlinkSync } from "fs-extra";
import Spinner from "ora";
import State from "../state";
import Config from "./index";
import Paths from "../system/paths";
import { Console } from "../logger";

export default class Editor {
    static nano(): void {
        const spinner: Spinner.Ora = Spinner({
            stream: process.stdout,
        }).start();

        const index = State.bridges.findIndex((item) => item.id === State.id);

        if (index >= 0) {
            const config = Config.configuration();

            if (State.id !== "hub") {
                for (let i = 0; i < (config?.accessories || []).length; i += 1) {
                    delete config.accessories[i].plugin_map;
                }

                for (let i = 0; i < (config?.platforms || []).length; i += 1) {
                    delete config.platforms[i].plugin_map;
                }
            }

            Paths.saveJson(join(Paths.data(), `${State.id}.config.json`), config, true);

            spinner.stop();

            spawn("nano", [join(Paths.data(), `${State.id}.config.json`)], {
                stdio: "inherit",
                detached: true,
            }).on("data", (data) => {
                process.stdout.pipe(data);
            }).on("close", () => {
                Config.saveConfig(Paths.loadJson<any>(join(Paths.data(), `${State.id}.config.json`), {}));

                unlinkSync(join(Paths.data(), `${State.id}.config.json`));
            });
        } else {
            Console.warn("please define a valid bridge");
        }
    }
}
