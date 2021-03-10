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

import { existsSync } from "fs-extra";
import Paths from "../system/paths";
import FFMPEG from "./ffmpeg";
import GUI from "./gui";

export default class Extentions {
    static list() {
        return [{
            feature: "gui",
            description: "enables the gui",
            enabled: existsSync("/usr/lib/hoobs/package.json"),
        }, {
            feature: "ffmpeg",
            description: "enables ffmpeg camera support",
            enabled: Paths.tryCommand("ffmpeg"),
        }];
    }

    static async enable(name: string): Promise<{ [key: string]: any }> {
        let results: { success: boolean, error?: string | undefined };

        switch (name) {
            case "ffmpeg":
                results = await FFMPEG.enable();

                if (results.error) {
                    return {
                        success: false,
                        error: results.error,
                    };
                }

                return {
                    success: true,
                };

            case "gui":
                results = await GUI.enable();

                if (results.error) {
                    return {
                        success: false,
                        error: results.error,
                    };
                }

                return {
                    success: true,
                };

            default:
                return {
                    success: false,
                    warning: "invalid extention",
                };
        }
    }

    static disable(name: string): { [key: string]: any } {
        let results: { [key: string]: any } = {};

        switch (name) {
            case "ffmpeg":
                results = FFMPEG.disable();

                if (results.error) {
                    return {
                        success: false,
                        error: results.error,
                    };
                }

                return {
                    success: true,
                };

            case "gui":
                results = GUI.disable();

                if (results.error) {
                    return {
                        success: false,
                        error: results.error,
                    };
                }

                return {
                    success: true,
                };

            default:
                return {
                    success: false,
                    warning: "invalid extention",
                };
        }
    }
}
