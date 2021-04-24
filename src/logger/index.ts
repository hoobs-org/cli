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

import Utility from "util";
import Chalk from "chalk";
import Table from "as-table";
import State from "../state";
import Paths from "../system/paths";
import { formatJson } from "../json";
import { colorize } from "../formatters";

export const enum LogLevel {
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    DEBUG = "debug",
}

export interface Message {
    level: LogLevel;
    bridge?: string;
    display?: string;
    timestamp: number;
    plugin?: string;
    prefix?: string;
    message: string;
}

const CONSOLE_LOG = console.log;
const CONSOLE_ERROR = console.error;

const grid = Table.configure({
    title: (item) => Chalk.cyan(item),
    print: (item) => Chalk.white(item),
    delimiter: Chalk.dim(" | "),
    dash: Chalk.dim("-"),
});

class Logger {
    constructor() {
        Chalk.level = 1;
    }

    load(tail?: number, bridge?: string): Promise<Message[]> {
        return new Promise((resolve) => {
            Paths.touch(Paths.log);

            setTimeout(() => {
                let results: Message[] = Paths.loadJson<Message[]>(Paths.log, [], undefined, true).filter((m) => (bridge ? m.bridge === bridge : true));

                if (!State.debug) results = results.filter((message) => message.level !== LogLevel.DEBUG);
                if (tail && tail > 0 && tail < results.length) results.splice(0, results.length - tail);

                resolve(results);
            }, 250);
        });
    }

    table(value: any) {
        CONSOLE_LOG(grid(value));
    }

    log(level: LogLevel, message: string | Message, ...parameters: any[]): void {
        let data: Message;

        if (typeof message === "string") {
            if (message.startsWith("Initializing HAP-NodeJS")) return;

            data = {
                level,
                timestamp: new Date().getTime(),
                message: Utility.format(`${message || ""}`, ...parameters),
            };
        } else {
            data = message;
        }

        if (!data || (data.message === "" && data.bridge)) return;

        const prefixes = [];

        if (State.timestamps && data.message && data.message !== "") prefixes.push(Chalk.gray.dim(new Date(data.timestamp).toLocaleString()));
        if (data.bridge && data.bridge !== "" && data.bridge !== "hub") prefixes.push(colorize(State.bridges.findIndex((bridge) => bridge.id === data.bridge), true)(data.display || data.bridge));
        if (data.prefix && data.prefix !== "") prefixes.push(colorize(data.prefix)(data.prefix));

        let colored = data.message;

        switch (data.level) {
            case LogLevel.WARN:
                colored = `${Chalk.bgYellow.black(" WARNING ")} ${Chalk.yellow(data.message)}`;
                break;

            case LogLevel.ERROR:
                colored = `${Chalk.bgRed.black(" ERROR ")} ${Chalk.red(data.message)}`;
                break;

            case LogLevel.DEBUG:
                colored = Chalk.gray(data.message);
                break;
        }

        const formatted = prefixes.length > 0 ? `${prefixes.join(" ")} ${colored}` : colored;

        switch (data.level) {
            case LogLevel.WARN:
                CONSOLE_LOG(formatted);
                break;

            case LogLevel.ERROR:
                CONSOLE_ERROR(formatted);
                break;

            case LogLevel.DEBUG:
                if (State.debug) CONSOLE_LOG(formatted);
                break;

            default:
                CONSOLE_LOG(formatted);
                break;
        }
    }

    debug(message: string, ...parameters: any[]): void {
        this.log(LogLevel.DEBUG, message, ...parameters);
    }

    info(message: string, ...parameters: any[]): void {
        this.log(LogLevel.INFO, message, ...parameters);
    }

    warn(message: string, ...parameters: any[]): void {
        this.log(LogLevel.WARN, message, ...parameters);
    }

    error(message: string, ...parameters: any[]): void {
        this.log(LogLevel.ERROR, message, ...parameters);
    }
}

const system: Logger = new Logger();

console.debug = function debug(message: string, ...parameters: any[]) {
    if (typeof message === "string") {
        system.debug(message, ...parameters);
    } else {
        system.debug(formatJson(message));
    }
};

console.log = function log(message: string, ...parameters: any[]) {
    if (typeof message === "string") {
        system.info(message, ...parameters);
    } else {
        system.info(formatJson(message));
    }
};

console.warn = function warn(message: string, ...parameters: any[]) {
    if (typeof message === "string") {
        system.warn(message, ...parameters);
    } else {
        system.warn(formatJson(message));
    }
};

console.error = function error(message: string, ...parameters: any[]) {
    if (typeof message === "string") {
        system.error(message, ...parameters);
    } else {
        system.error(formatJson(message));
    }
};
export const Console: Logger = system;
