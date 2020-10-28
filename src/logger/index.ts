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
import { gunzipSync } from "zlib";
import { readFileSync } from "fs-extra";
import State from "../state";
import Paths from "../system/paths";

import {
    parseJson,
    colorize,
} from "../formatters";

export const enum LogLevel {
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    DEBUG = "debug",
}

export interface Message {
    level: LogLevel,
    instance?: string,
    display?: string,
    timestamp: number,
    plugin?: string,
    prefix?: string,
    message: string,
}

export const enum NotificationType {
    INFO = "info",
    SUCCESS = "success",
    WARN = "warn",
    ERROR = "error",
    DEBUG = "debug",
}

export const enum Events {
    PING = "ping",
    PONG = "pong",
    LOG = "log",
    LISTENING = "listening",
    MONITOR = "monitor",
    HEARTBEAT = "heartbeat",
    NOTIFICATION = "notification",
    ACCESSORY_CHANGE = "accessory_change",
    PUBLISH_SETUP_URI = "publish_setup_uri",
    REQUEST = "request",
    COMPLETE = "complete",
    SHELL_OUTPUT = "shell_output",
    SHELL_INPUT = "shell_input",
    SHELL_RESIZE = "shell_resize",
    SHELL_CLEAR = "shell_clear",
    SHELL_CONNECT = "shell_connect",
    SHELL_DISCONNECT = "shell_disconnect",
    SHUTDOWN = "shutdown",
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

    load(tail?: number, instance?: string): Message[] {
        let results: Message[] = [];

        try {
            results = (parseJson<Message[]>(gunzipSync(readFileSync(Paths.logPath())).toString(), [])).filter((m) => (instance ? m.instance === instance : true));
        } catch (_error) {
            results = [];
        }

        if (tail && tail > 0 && tail < results.length) {
            results.splice(0, results.length - tail);
        }

        return results;
    }

    table(value: any) {
        CONSOLE_LOG("");
        CONSOLE_LOG(grid(value));
        CONSOLE_LOG("");
    }

    log(level: LogLevel, message: string | Message, ...parameters: any[]): void {
        let data: Message;

        if (typeof message === "string") {
            data = {
                level,
                timestamp: new Date().getTime(),
                message: Utility.format(`${message || ""}`, ...parameters),
            };
        } else {
            data = message;
        }

        if (!data || (data.message === "" && data.instance)) {
            return;
        }

        const prefixes = [];

        if (State.timestamps && data.message && data.message !== "") {
            prefixes.push(Chalk.gray.dim(new Date(data.timestamp).toLocaleString()));
        }

        if (data.instance && data.instance !== "" && data.instance !== "api") {
            prefixes.push(colorize(State.instances.findIndex((instance) => instance.id === data.instance), true)(data.display || data.instance));
        }

        if (data.prefix && data.prefix !== "") {
            prefixes.push(colorize(data.prefix)(data.prefix));
        }

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
    system.debug(message, ...parameters);
};

console.log = function log(message: string, ...parameters: any[]) {
    system.info(message, ...parameters);
};

console.warn = function warn(message: string, ...parameters: any[]) {
    system.warn(message, ...parameters);
};

console.error = function error(message: string, ...parameters: any[]) {
    system.error(message, ...parameters);
};

export const Console: Logger = system;
