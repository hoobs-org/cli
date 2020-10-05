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

import Paths from "../system/paths";
import Ffmpeg from "./ffmpeg";

export default class Extentions {
    static list() {
        return [{
            feature: "ffmpeg",
            description: "enables ffmpeg camera support",
            enabled: Paths.tryCommand("ffmpeg"),
        }];
    }

    static enable(name: string): Promise<{ [key: string]: any }> {
        return new Promise((resolve) => {
            let results: { [key: string]: any } = {};

            switch (name) {
                case "ffmpeg":
                    results = Ffmpeg.enable();

                    if (results.error) {
                        return resolve({
                            success: false,
                            error: results.error,
                        });
                    }

                    return resolve({
                        success: true,
                    });

                default:
                    return resolve({
                        success: false,
                        warning: "invalid extention",
                    });
            }
        });
    }

    static disable(name: string): Promise<{ [key: string]: any }> {
        return new Promise((resolve) => {
            let results: { [key: string]: any } = {};

            switch (name) {
                case "ffmpeg":
                    results = Ffmpeg.disable();

                    if (results.error) {
                        return resolve({
                            success: false,
                            error: results.error,
                        });
                    }

                    return resolve({
                        success: true,
                    });

                default:
                    return resolve({
                        success: false,
                        warning: "invalid extention",
                    });
            }
        });
    }
}
