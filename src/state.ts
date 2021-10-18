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
import { existsSync, readJSONSync } from "fs-extra";
import { BridgeRecord } from "./system/bridges";

export interface Application {
    mode: string;

    id: string;
    display: string;

    debug: boolean;
    verbose: boolean;
    timestamps: boolean;

    version: string;
    bridges: BridgeRecord[];
}

const state: Application = {
    mode: "production",

    id: "default",
    display: "Default",

    debug: false,
    verbose: false,
    timestamps: false,

    version: readJSONSync(existsSync(join(__dirname, "./package.json")) ? join(__dirname, "./package.json") : join(__dirname, "../../package.json")).version,
    bridges: [],
};

export default state;
