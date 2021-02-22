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

import "source-map-support/register";

import Program from "commander";
import Inquirer from "inquirer";
import Chalk from "chalk";
import Spinner from "ora";
import { join } from "path";
import { existsSync, copyFileSync, readdirSync } from "fs-extra";
import Paths from "./system/paths";
import State from "./state";
import System from "./system";
import Bridges from "./system/bridges";
import Editor from "./config/editor";
import Extentions from "./extentions";
import Plugins from "./plugins";
import Writer from "./plugins/writer";
import { Console, LogLevel } from "./logger";
import { sanitize } from "./formatters";

const prompt: Inquirer.PromptModule = Inquirer.createPromptModule();

if (System.shellSync("cat /proc/1/cgroup | grep 'docker\\|lxc'") !== "") {
    State.container = true;
}

export = function Main(): void {
    Program.version(State.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.option("-m, --mode <mode>", "set the enviornment", (mode: string) => { State.mode = mode; })
        .option("-d, --debug", "turn on debug level logging", () => { State.debug = true; })
        .option("--container", "run in a container", () => { State.container = true; })
        .option("--verbose", "turn on verbose logging", () => { State.verbose = true; });

    Program.command("install")
        .description("initial setup")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .option("-n, --pin <pin>", "set the pin for the bridge")
        .action(async (command) => {
            if (State.mode !== "development" && (await System.hoobsd.info()).hoobsd_version === "") await System.hoobsd.upgrade();

            State.bridges = Bridges.list();

            let bridges = [];

            if (State.bridges.findIndex((n) => n.id === "hub") >= 0) {
                Console.warn("this system is already initilized.");
            } else {
                if (process.env.USER !== "root") {
                    Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                    return;
                }

                if (Number.isNaN(parseInt(command.port, 10))) {
                    command.port = parseInt((await prompt([
                        {
                            type: "number",
                            name: "port",
                            default: "50826",
                            message: "enter the port for the hub",
                            validate: (value: number | undefined) => {
                                if (!value || Number.isNaN(value)) return "invalid port number";
                                if (value < 1 || value > 65535) return "select a port between 1 and 65535";
                                if (State.bridges.findIndex((n) => n.port === value) >= 0) return "port is already in use";

                                return true;
                            },
                        },
                    ])).port, 10);
                }

                Bridges.create("Hub", parseInt(command.port, 10), command.pin || "031-45-154", 0).then((results) => {
                    if (results) {
                        bridges = Bridges.list();

                        if (bridges.length > 0) {
                            console.info("");

                            Console.table(bridges.map((item) => ({
                                id: item.id,
                                type: item.type,
                                display: item.display,
                                running: existsSync(join(Paths.data(), `${item.id}.sock`)),
                                port: item.port,
                                pin: item.pin,
                                username: item.username,
                            })));

                            console.info("");
                        }
                    } else {
                        Console.error("unable to initilize system.");
                    }

                    process.exit();
                });
            }
        });

    Program.command("plugin [action] [name]")
        .description("manage plugins for a given bridge")
        .option("-b, --bridge <name>", "set the bridge name")
        .action(async (action, name, command) => {
            if (action !== "create" && process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.id = sanitize(command.bridge);
            State.bridges = Bridges.list();

            if (action !== "create" && State.bridges.findIndex((n) => n.id === "hub") === -1) {
                Console.warn("system is not initilized, please initilize the system first.");

                return;
            }

            let combined: { [key: string]: any }[] = [];
            let plugin: string = name;
            let plugins: { [key: string]: any }[] = [];
            let scope = "";
            let tag = "latest";

            switch (action) {
                case "add":
                case "install":
                    if (State.bridges.filter((item) => item.type === "bridge").length === 0) {
                        Console.warn("no bridges defined");

                        return;
                    }

                    if (!plugin) {
                        Console.warn("please define a plugin");

                        return;
                    }

                    if (!command.bridge || command.bridge === "" || State.id === "hub") {
                        if (State.bridges.filter((item) => item.type === "bridge").length === 1) {
                            State.id = State.bridges.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { bridge } = (await prompt([{
                                type: "list",
                                name: "bridge",
                                message: "Please select an bridge",
                                choices: State.bridges.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            State.id = bridge;
                        }
                    }

                    if (plugin.startsWith("@")) {
                        plugin = plugin.substring(1);
                        scope = plugin.split("/").shift() || "";
                        plugin = plugin.split("/").pop() || "";
                    }

                    if (plugin.indexOf("@") >= 0) {
                        tag = plugin.split("@").pop() || "latest";
                        plugin = plugin.split("@").shift() || "";
                    }

                    Plugins.install(scope && scope !== "" ? `@${scope}/${plugin}` : plugin, tag).finally(() => {
                        plugins = Plugins.installed();

                        if (plugins.length > 0) {
                            console.info("");

                            Console.table(plugins.map((item: { [key: string]: any }) => ({
                                name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                version: item.version,
                                path: item.directory,
                            })));

                            console.info("");
                        } else {
                            Console.warn("no plugins installed");
                        }

                        process.exit();
                    });

                    break;

                case "rm":
                case "remove":
                case "uninstall":
                    if (State.bridges.filter((item) => item.type === "bridge").length === 0) {
                        Console.warn("no bridges defined");

                        return;
                    }

                    if (!plugin) {
                        Console.warn("please define a plugin");

                        return;
                    }

                    if (!command.bridge || command.bridge === "" || State.id === "hub") {
                        if (State.bridges.filter((item) => item.type === "bridge").length === 1) {
                            State.id = State.bridges.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { bridge } = (await prompt([{
                                type: "list",
                                name: "bridge",
                                message: "Please select an bridge",
                                choices: State.bridges.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            State.id = bridge;
                        }
                    }

                    if (plugin.startsWith("@")) {
                        plugin = plugin.substring(1);
                        scope = plugin.split("/").shift() || "";
                        plugin = plugin.split("/").pop() || "";
                    }

                    if (plugin.indexOf("@") >= 0) {
                        plugin = plugin.split("@").shift() || "";
                    }

                    Plugins.uninstall(scope && scope !== "" ? `@${scope}/${plugin}` : plugin).finally(() => {
                        plugins = Plugins.installed();

                        if (plugins.length > 0) {
                            console.info("");

                            Console.table(plugins.map((item: { [key: string]: any }) => ({
                                name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                version: item.version,
                                path: item.directory,
                            })));

                            console.info("");
                        } else {
                            Console.warn("no plugins installed");
                        }

                        process.exit();
                    });

                    break;

                case "update":
                case "upgrade":
                    if (State.bridges.filter((item) => item.type === "bridge").length === 0) {
                        Console.warn("no bridges defined");

                        return;
                    }

                    if (!command.bridge || command.bridge === "" || State.id === "hub") {
                        if (State.bridges.filter((item) => item.type === "bridge").length === 1) {
                            State.id = State.bridges.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { bridge } = (await prompt([{
                                type: "list",
                                name: "bridge",
                                message: "Please select an bridge",
                                choices: State.bridges.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            State.id = bridge;
                        }
                    }

                    if (plugin) {
                        if (plugin.startsWith("@")) {
                            plugin = plugin.substring(1);
                            scope = plugin.split("/").shift() || "";
                            plugin = plugin.split("/").pop() || "";
                        }

                        if (plugin.indexOf("@") >= 0) {
                            tag = plugin.split("@").pop() || "latest";
                            plugin = plugin.split("@").shift() || "";
                        }

                        Plugins.upgrade(scope && scope !== "" ? `@${scope}/${plugin}` : plugin, tag).finally(() => {
                            plugins = Plugins.installed();

                            if (plugins.length > 0) {
                                console.info("");

                                Console.table(plugins.map((item: { [key: string]: any }) => ({
                                    name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                    version: item.version,
                                    path: item.directory,
                                })));

                                console.info("");
                            } else {
                                Console.warn("no plugins installed");
                            }

                            process.exit();
                        });
                    } else {
                        Plugins.upgrade().finally(() => {
                            plugins = Plugins.installed();

                            if (plugins.length > 0) {
                                console.info("");

                                Console.table(plugins.map((item: { [key: string]: any }) => ({
                                    name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                    version: item.version,
                                    path: item.directory,
                                })));

                                console.info("");
                            } else {
                                Console.warn("no plugins installed");
                            }

                            process.exit();
                        });
                    }

                    break;

                case "ls":
                case "list":
                    if (State.id === "hub") {
                        Console.warn("please define a valid bridge");

                        return;
                    }

                    if (!command.bridge || command.bridge === "") {
                        for (let i = 0; i < State.bridges.length; i += 1) {
                            if (State.bridges[i].type === "bridge") {
                                State.id = State.bridges[i].id;

                                plugins = Plugins.installed();

                                combined = [...combined, ...(plugins.map((item) => ({
                                    bridge: State.id,
                                    name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                    version: item.version,
                                    path: item.directory,
                                })))];
                            }
                        }

                        combined.sort((a, b) => {
                            if (a.name < b.name) return -1;
                            if (a.name > b.name) return 1;
                            return 0;
                        });

                        State.id = "hub";

                        if (combined.length > 0) {
                            console.info("");
                            Console.table(combined);
                            console.info("");
                        } else {
                            Console.warn("no plugins installed");
                        }
                    } else {
                        plugins = Plugins.installed();

                        if (plugins.length > 0) {
                            console.info("");

                            Console.table(plugins.map((item) => ({
                                name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                version: item.version,
                                path: item.directory,
                            })));

                            console.info("");
                        } else {
                            Console.warn("no plugins installed");
                        }
                    }

                    break;

                case "create":
                    if (!name || name === "") {
                        Console.warn("invalid plugin name");

                        return;
                    }

                    if (process.env.USER === "root") {
                        Console.warn("you are running as root, are you sure?");
                    }

                    if (plugin.startsWith("@")) {
                        plugin = plugin.substring(1);
                        scope = plugin.split("/").shift() || "";
                        plugin = plugin.split("/").pop() || "";
                    }

                    if (plugin.indexOf("@") >= 0) {
                        tag = plugin.split("@").pop() || "";
                        plugin = plugin.split("@").shift() || "";
                    }

                    Writer.create(scope, plugin, tag);
                    break;

                default:
                    Console.info(Program.helpInformation());
                    break;
            }
        });

    Program.command("log")
        .description("show the combined log from the hub and bridges")
        .option("-b, --bridge <name>", "set the bridge name")
        .option("-t, --tail <lines>", "set the number of lines")
        .action((command) => {
            if (process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.bridges = Bridges.list();

            if (State.bridges.findIndex((n) => n.id === "hub") === -1) {
                Console.warn("system is not initilized, please initilize the system first.");

                return;
            }

            State.timestamps = true;

            let bridge: string;

            if (command.bridge) {
                bridge = sanitize(command.bridge);
            }

            const messages = Console.load(parseInt(command.tail, 10) || 50, bridge!);

            for (let i = 0; i < messages.length; i += 1) {
                if (messages[i].message && messages[i].message !== "") {
                    Console.log(LogLevel.INFO, messages[i]);
                }
            }
        });

    Program.command("config")
        .description("manage the configuration for a given bridge")
        .option("-b, --bridge <name>", "set the bridge name")
        .action(async (command) => {
            if (process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.id = sanitize(command.bridge || "hub");
            State.bridges = Bridges.list();

            if (State.bridges.findIndex((n) => n.id === "hub") === -1) {
                Console.warn("system is not initilized, please initilize the system first.");

                return;
            }

            if (!command.bridge || command.bridge === "" || State.id === "hub") {
                if (State.bridges.length === 1) {
                    State.id = State.bridges[0].id;
                } else {
                    const { bridge } = (await prompt([{
                        type: "list",
                        name: "bridge",
                        message: "Please select an bridge",
                        choices: State.bridges.map((item) => ({
                            name: item.display,
                            value: item.id,
                        })),
                    }]));

                    State.id = bridge;
                }
            }

            Editor.nano();
        });

    Program.command("bridge [action]")
        .description("manage server bridges")
        .option("-b, --bridge <name>", "set the bridge name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .option("-u, --uuid <name>", "uuid for managing cache")
        .action(async (action, command) => {
            if (process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.bridges = Bridges.list();

            let spinner: Spinner.Ora;
            let bridges = [];

            if (State.bridges.findIndex((n) => n.id === "hub") === -1) {
                Console.warn("system is not initilized, please initilize the system first.");

                return;
            }

            switch (action) {
                case "add":
                case "create":
                    Bridges.create(command.bridge, parseInt(command.port, 10), "031-45-154", 0).then((results) => {
                        if (results) {
                            bridges = Bridges.list();

                            if (bridges.length > 0) {
                                console.info("");

                                Console.table(bridges.map((item) => ({
                                    id: item.id,
                                    type: item.type,
                                    display: item.display,
                                    running: existsSync(join(Paths.data(), `${item.id}.sock`)),
                                    port: item.port,
                                    pin: item.pin,
                                    username: item.username,
                                })));

                                console.info("");
                            }
                        } else {
                            Console.error("unable to create bridge.");
                        }

                        process.exit();
                    });

                    break;

                case "rm":
                case "remove":
                    if (!command.bridge || command.bridge === "") {
                        if (State.bridges.filter((item) => item.type === "bridge").length === 1) {
                            command.bridge = State.bridges.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { bridge } = (await prompt([{
                                type: "list",
                                name: "bridge",
                                message: "Please select an bridge",
                                choices: State.bridges.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            command.bridge = bridge;
                        }
                    }

                    if (sanitize(command.bridge) !== "hub") {
                        spinner = Spinner({ stream: process.stdout }).start();

                        Bridges.uninstall(command.bridge).then((results) => {
                            if (results) {
                                bridges = Bridges.list();

                                spinner.stop();

                                if (bridges.length > 0) {
                                    console.info("");

                                    Console.table(bridges.map((item) => ({
                                        id: item.id,
                                        type: item.type,
                                        display: item.display,
                                        running: existsSync(join(Paths.data(), `${item.id}.sock`)),
                                        port: item.port,
                                        pin: item.pin,
                                        username: item.username,
                                    })));

                                    console.info("");
                                }
                            } else {
                                spinner.stop();

                                Console.error("unable to remove bridge.");
                            }

                            process.exit();
                        });
                    } else {
                        Console.warn("this is not an bridge, to remove the hub run a system reset.");
                    }

                    break;

                case "cache":
                    State.id = sanitize(command.bridge || "hub");

                    if (!command.bridge || command.bridge === "" || State.id === "hub") {
                        if (State.bridges.filter((item) => item.type === "bridge").length === 1) {
                            State.id = State.bridges.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { bridge } = (await prompt([{
                                type: "list",
                                name: "bridge",
                                message: "Please select an bridge",
                                choices: State.bridges.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            State.id = bridge;
                        }
                    }

                    if (sanitize(command.bridge) !== "hub") {
                        console.info("");
                        Console.table(Bridges.cache());
                        console.info("");
                    } else {
                        Console.warn("not a valid bridge.");
                    }

                    break;

                case "purge":
                    State.id = sanitize(command.bridge || "hub");

                    if (!command.bridge || command.bridge === "" || State.id === "hub") {
                        if (State.bridges.filter((item) => item.type === "bridge").length === 1) {
                            State.id = State.bridges.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { bridge } = (await prompt([{
                                type: "list",
                                name: "bridge",
                                message: "Please select an bridge",
                                choices: State.bridges.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            State.id = bridge;
                        }
                    }

                    if (sanitize(command.bridge) !== "hub") {
                        Console.warn("this will remove the connection to homekit, you will need to re-pair");

                        spinner = Spinner({ stream: process.stdout }).start();

                        Bridges.purge(command.uuid).then(() => {
                            spinner.stop();

                            Console.info("bridge caches purged");
                            process.exit();
                        });
                    } else {
                        Console.warn("not a valid bridge.");
                    }

                    break;

                case "export":
                    if (!command.bridge || command.bridge === "") {
                        if (State.bridges.filter((item) => item.type === "bridge").length === 1) {
                            command.bridge = State.bridges.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { bridge } = (await prompt([{
                                type: "list",
                                name: "bridge",
                                message: "Please select an bridge",
                                choices: State.bridges.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            command.bridge = bridge;
                        }
                    }

                    if (sanitize(command.bridge) !== "hub") {
                        spinner = Spinner({ stream: process.stdout }).start();

                        Bridges.export(command.bridge).then((filename) => {
                            copyFileSync(
                                join(Paths.backups, filename),
                                join(process.cwd(), `${sanitize(command.bridge)}.bridge`),
                            );

                            spinner.stop();

                            Console.info(`bridge exported ${Chalk.yellow(join(process.cwd(), filename))}`);
                        }).catch((error) => {
                            spinner.stop();

                            Console.error(error.message || "unable to create backup");
                        });
                    }

                    break;

                case "ls":
                case "list":
                    bridges = Bridges.list();

                    if (bridges.length > 0) {
                        console.info("");

                        Console.table(bridges.map((item) => ({
                            id: item.id,
                            type: item.type,
                            display: item.display,
                            running: existsSync(join(Paths.data(), `${item.id}.sock`)),
                            port: item.port,
                            pin: item.pin,
                            username: item.username,
                        })));

                        console.info("");
                    } else {
                        Console.warn("no bridges");
                    }

                    break;

                default:
                    Console.info(Program.helpInformation());
                    break;
            }
        });

    Program.command("extention [action] [name]")
        .description("manage extentions")
        .action((action, name) => {
            if (process.env.USER !== "root") {
                Console.warn("root is required, did you forget to use 'sudo'?");

                return;
            }

            State.bridges = Bridges.list();

            let spinner: Spinner.Ora;
            let list: { [key: string]: any }[] = [];

            switch (action) {
                case "add":
                case "install":
                    if (State.bridges.findIndex((n) => n.id === "hub") === -1) {
                        Console.warn("system is not initilized, please initilize the system first.");

                        return;
                    }

                    spinner = Spinner({ stream: process.stdout }).start();

                    Extentions.enable(name).then((results) => {
                        spinner.stop();

                        if (!results.success && results.warning) {
                            Console.error(results.warning);
                        } else if (!results.success) {
                            Console.error(results.error || "unhandled error");
                        } else {
                            Extentions.list();
                        }

                        process.exit();
                    });

                    break;

                case "rm":
                case "remove":
                case "uninstall":
                    if (State.bridges.findIndex((n) => n.id === "hub") === -1) {
                        Console.warn("system is not initilized, please initilize the system first.");

                        return;
                    }

                    spinner = Spinner({ stream: process.stdout }).start();

                    Extentions.disable(name).then((results) => {
                        spinner.stop();

                        if (!results.success && results.warning) {
                            Console.error(results.warning);
                        } else if (!results.success) {
                            Console.error(results.error || "unhandled error");
                        } else {
                            Extentions.list();
                        }

                        process.exit();
                    });

                    break;

                case "ls":
                case "list":
                    if (State.bridges.findIndex((n) => n.id === "hub") === -1) {
                        Console.warn("system is not initilized, please initilize the system first.");

                        return;
                    }

                    list = Extentions.list();

                    console.info("");
                    Console.table(list);
                    console.info("");
                    break;

                default:
                    Console.info(Program.helpInformation());
                    break;
            }
        });

    Program.command("system <action> [file]")
        .description("reboot, reset and upgrade this device")
        .option("-t, --test", "test upgrade operation")
        .option("--beta", "enable beta versions")
        .action(async (action, file, command) => {
            if (process.env.USER !== "root") {
                Console.warn("root is required, did you forget to use 'sudo'?");

                return;
            }

            State.bridges = Bridges.list();

            const list: { [key: string]: any}[] = [];
            const waits: Promise<void>[] = [];

            let spinner: Spinner.Ora;
            let entries: string[] = [];
            let reboot = false;

            switch (action) {
                case "hostname":
                    System.info().then(async (system) => {
                        if (system.mdns && file) {
                            Console.info("setting hostname");

                            await System.hostname(file);
                        } else if (system.mdns) {
                            Console.info(Chalk.cyan(system.mdns_broadcast));
                        } else {
                            Console.info(Program.helpInformation());
                        }
                    });

                    break;

                case "version":
                case "versions":
                    spinner = Spinner({ stream: process.stdout }).start();

                    System.info().then((system) => {
                        if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get") {
                            waits.push(new Promise<void>((resolve) => {
                                System.runtime.info(command.beta).then((results: { [key: string]: any }) => {
                                    list.push({
                                        application: "node",
                                        distribution: system.distribution,
                                        package_manager: system.package_manager,
                                        version: results.node_version,
                                        latest: results.node_current,
                                        upgraded: results.node_upgraded,
                                        init_system: "",
                                        running: "",
                                    });

                                    resolve();
                                });
                            }));
                        }

                        waits.push(new Promise<void>((resolve) => {
                            System.cli.info(command.beta).then((results: { [key: string]: any }) => {
                                list.push({
                                    application: "cli",
                                    distribution: system.distribution,
                                    package_manager: system.package_manager,
                                    version: results.cli_version,
                                    latest: results.cli_current,
                                    upgraded: results.cli_upgraded,
                                    init_system: "",
                                    running: "",
                                });

                                resolve();
                            });
                        }));

                        waits.push(new Promise<void>((resolve) => {
                            System.hoobsd.info(command.beta).then((results: { [key: string]: any }) => {
                                list.push({
                                    application: "hoobsd",
                                    distribution: system.distribution,
                                    package_manager: system.package_manager,
                                    version: results.hoobsd_version,
                                    latest: results.hoobsd_current,
                                    upgraded: results.hoobsd_upgraded,
                                    init_system: system.init_system,
                                    running: results.hoobsd_running,
                                });

                                resolve();
                            });
                        }));

                        Promise.all(waits).then(() => {
                            spinner.stop();

                            console.info("");
                            Console.table(list);
                            console.info("");
                        });
                    });

                    break;

                case "backup":
                    switch (file) {
                        case "ls":
                        case "list":
                            entries = readdirSync(Paths.backups).filter((item) => item.endsWith(".backup"));

                            for (let i = 0; i < entries.length; i += 1) {
                                list.push({
                                    date: (new Date(parseInt(entries[i].replace(".backup", ""), 10))).toLocaleString(),
                                    path: join(Paths.backups, entries[i]),
                                });
                            }

                            if (list.length > 0) {
                                console.info("");
                                Console.table(list);
                                console.info("");
                            } else {
                                Console.warn("no backups");
                            }

                            break;

                        default:
                            spinner = Spinner({ stream: process.stdout }).start();

                            Bridges.backup().then((filename) => {
                                copyFileSync(
                                    join(Paths.backups, filename),
                                    join(process.cwd(), "hoobs.backup"),
                                );

                                spinner.stop();

                                Console.info(`backup created ${Chalk.yellow(join(process.cwd(), filename))}`);
                            }).catch((error) => {
                                spinner.stop();

                                Console.error(error.message || "unable to create backup");
                            });

                            break;
                    }

                    break;

                case "restore":
                    Console.warn("this will remove all current settings and plugins and replace it with the backup");

                    if (file && existsSync(file)) {
                        spinner = Spinner({ stream: process.stdout }).start();

                        Bridges.restore(file).finally(() => {
                            spinner.stop();

                            Console.info("restore complete");
                        });
                    } else {
                        Console.warn("invalid restore file");
                    }

                    break;

                case "reset":
                    Console.warn("this will remove all settings and plugins, you will need to restore or initilize this device");

                    Bridges.reset();

                    Console.info("configuration and plugins removed");
                    break;

                case "update":
                case "upgrade":
                    spinner = Spinner({ stream: process.stdout }).start();

                    System.info().then((system) => {
                        spinner.stop();

                        Promise.all([new Promise<void>((resolve) => {
                            if ((system.product === "box" || system.product === "card") && system.package_manager === "apt-get") {
                                spinner = Spinner({ text: "checking node", stream: process.stdout }).start();

                                System.runtime.info(command.beta).then((results: { [key: string]: any }) => {
                                    spinner.stop();

                                    if (!results.node_upgraded) {
                                        if (command.test) {
                                            Console.info(Chalk.yellow(`node will be upgraded to ${results.node_current}`));
                                        } else {
                                            spinner = Spinner({ text: "upgrading node", stream: process.stdout }).start();

                                            System.runtime.upgrade().then(() => {
                                                spinner.stop();

                                                Console.info(Chalk.green(`node upgraded to ${results.node_current}`));

                                                resolve();
                                            });
                                        }
                                    } else {
                                        Console.info(Chalk.green("node is already up-to-date"));

                                        resolve();
                                    }
                                });
                            } else {
                                resolve();
                            }
                        })]).then(() => {
                            Promise.all([new Promise<void>((resolve) => {
                                spinner = Spinner({ text: "checking cli", stream: process.stdout }).start();

                                System.cli.info(command.beta).then((results: { [key: string]: any }) => {
                                    spinner.stop();

                                    if (!results.cli_upgraded) {
                                        if (command.test) {
                                            Console.info(Chalk.yellow(`cli will be upgraded to ${results.cli_current}`));
                                        } else {
                                            spinner = Spinner({ text: "upgrading cli", stream: process.stdout }).start();

                                            System.cli.upgrade().then(() => {
                                                spinner.stop();

                                                Console.info(Chalk.green(`cli upgraded to ${results.cli_current}`));

                                                resolve();
                                            });
                                        }
                                    } else {
                                        Console.info(Chalk.green("cli is already up-to-date"));

                                        resolve();
                                    }
                                });
                            })]).then(() => {
                                Promise.all([new Promise<void>((resolve) => {
                                    spinner = Spinner({ text: "checking hoobsd", stream: process.stdout }).start();

                                    System.hoobsd.info(command.beta).then((results: { [key: string]: any }) => {
                                        spinner.stop();

                                        if (!results.hoobsd_upgraded) {
                                            if (command.test) {
                                                Console.info(Chalk.yellow(`hoobsd will be upgraded to ${results.hoobsd_current}`));
                                            } else {
                                                spinner = Spinner({ text: "upgrading hoobsd", stream: process.stdout }).start();
                                                reboot = results.hoobsd_running;

                                                System.hoobsd.upgrade().then(() => {
                                                    spinner.stop();

                                                    Console.info(Chalk.green(`hoobsd upgraded to ${results.hoobsd_current}`));

                                                    resolve();
                                                });
                                            }
                                        } else {
                                            Console.info(Chalk.green("hoobsd is already up-to-date"));

                                            resolve();
                                        }
                                    });
                                })]).then(async () => {
                                    if (!command.test && reboot && State.container && State.mode === "production") {
                                        Console.info(Chalk.yellow("you need to restart this container"));
                                    } else if (!command.test && reboot && State.mode === "production") {
                                        const { proceed } = (await prompt([{
                                            type: "confirm",
                                            name: "proceed",
                                            message: Chalk.yellow("the hoobsd service needs to restart, do you want to restart it now"),
                                            default: false,
                                        }]));

                                        if (!proceed) System.restart();
                                    } else if (command.test && reboot) {
                                        Console.info(Chalk.yellow("this will require a reboot"));
                                    }
                                });
                            });
                        });
                    });

                    break;

                default:
                    Console.info(Program.helpInformation());
                    break;
            }
        });

    Program.parse(process.argv);
};
