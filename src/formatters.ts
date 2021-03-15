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

import Sanitize from "sanitize-filename";
import Chalk from "chalk";

export function sanitize(value: string, prevent?: string): string {
    if (!value || value === "") return "default";
    if (prevent && prevent !== "" && prevent.toLowerCase() === value.toLowerCase()) return "default";

    return Sanitize(value).toLowerCase().replace(/ /gi, "");
}

export function colorize(value: number | string, bright?: boolean): any {
    let index = 0;

    if (typeof value === "string") {
        index = parseInt(`${Number(Buffer.from(value.replace(/hoobs/gi, "").replace(/homebridge/gi, ""), "utf-8").toString("hex"))}`, 10) % 6;
    } else if (typeof value === "number") {
        index = value % 6;
    }

    switch (index) {
        case 1:
            return bright ? Chalk.cyanBright : Chalk.cyan;

        case 2:
            return bright ? Chalk.blueBright : Chalk.blue;

        case 3:
            return bright ? Chalk.magentaBright : Chalk.magenta;

        case 4:
            return bright ? Chalk.greenBright : Chalk.green;

        case 5:
            return bright ? Chalk.yellowBright : Chalk.yellow;

        default:
            return bright ? Chalk.redBright : Chalk.red;
    }
}
