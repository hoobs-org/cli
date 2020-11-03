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
import { execSync } from "child_process";
import { existsSync, copyFileSync, readdirSync } from "fs-extra";
import Paths from "./system/paths";
import State from "./state";
import Instances from "./system/instances";
import Editor from "./config/editor";
import Extentions from "./extentions";
import Cockpit from "./cockpit";
import Plugins from "./plugins";
import Writer from "./plugins/writer";
import { Console, LogLevel } from "./logger";
import { sanitize } from "./formatters";

const prompt: Inquirer.PromptModule = Inquirer.createPromptModule();

export = function Command(): void {
    Program.version(State.version, "-v, --version", "output the current version");
    Program.allowUnknownOption();

    Program.option("-m, --mode <mode>", "set the enviornment", (mode: string) => { State.mode = mode; })
        .option("-d, --debug", "turn on debug level logging", () => { State.debug = true; })
        .option("-v, --verbose", "turn on verbose logging", () => { State.verbose = true; })
        .option("-c, --container", "run in a container", () => { State.container = true; });

    Program.command("plugin [action] [name]")
        .description("manage plugins for a given instance")
        .option("-i, --instance <name>", "set the instance name")
        .action(async (action, name, command) => {
            if (action !== "create" && process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.id = sanitize(command.instance);
            State.instances = Instances.list();

            if (action !== "create" && State.instances.findIndex((n) => n.id === "api") === -1) {
                Console.warn("system is not initilized, please initilize the system first.");

                return;
            }

            let spinner: Spinner.Ora;
            let combined: { [key: string]: any }[] = [];
            let plugin: string = name;
            let plugins: { [key: string]: any }[] = [];
            let scope = "";
            let tag = "latest";

            switch (action) {
                case "add":
                case "install":
                    if (State.instances.filter((item) => item.type === "bridge").length === 0) {
                        Console.warn("no instances defined");

                        return;
                    }

                    if (!command.instance || command.instance === "" || State.id === "api") {
                        if (State.instances.filter((item) => item.type === "bridge").length === 1) {
                            State.id = State.instances.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { instance } = (await prompt([{
                                type: "list",
                                name: "instance",
                                message: "Please select an instance",
                                choices: State.instances.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            State.id = instance;
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
                        spinner = Spinner({
                            stream: process.stdout,
                        }).start();

                        plugins = Plugins.installed();

                        spinner.stop();

                        if (plugins.length > 0) {
                            Console.table(plugins.map((item: { [key: string]: any }) => ({
                                name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                version: item.version,
                                path: item.directory,
                            })));
                        } else {
                            Console.warn("no plugins installed");
                        }

                        process.exit();
                    });

                    break;

                case "rm":
                case "remove":
                case "uninstall":
                    if (State.instances.filter((item) => item.type === "bridge").length === 0) {
                        Console.warn("no instances defined");

                        return;
                    }

                    if (!command.instance || command.instance === "" || State.id === "api") {
                        if (State.instances.filter((item) => item.type === "bridge").length === 1) {
                            State.id = State.instances.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { instance } = (await prompt([{
                                type: "list",
                                name: "instance",
                                message: "Please select an instance",
                                choices: State.instances.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            State.id = instance;
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
                        spinner = Spinner({
                            stream: process.stdout,
                        }).start();

                        plugins = Plugins.installed();

                        spinner.stop();

                        if (plugins.length > 0) {
                            Console.table(plugins.map((item: { [key: string]: any }) => ({
                                name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                version: item.version,
                                path: item.directory,
                            })));
                        } else {
                            Console.warn("no plugins installed");
                        }

                        process.exit();
                    });

                    break;

                case "update":
                    if (State.instances.filter((item) => item.type === "bridge").length === 0) {
                        Console.warn("no instances defined");

                        return;
                    }

                    if (!command.instance || command.instance === "" || State.id === "api") {
                        if (State.instances.filter((item) => item.type === "bridge").length === 1) {
                            State.id = State.instances.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { instance } = (await prompt([{
                                type: "list",
                                name: "instance",
                                message: "Please select an instance",
                                choices: State.instances.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            State.id = instance;
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
                            spinner = Spinner({
                                stream: process.stdout,
                            }).start();

                            plugins = Plugins.installed();

                            spinner.stop();

                            if (plugins.length > 0) {
                                Console.table(plugins.map((item: { [key: string]: any }) => ({
                                    name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                    version: item.version,
                                    path: item.directory,
                                })));
                            } else {
                                Console.warn("no plugins installed");
                            }

                            process.exit();
                        });
                    } else {
                        Plugins.upgrade().finally(() => {
                            spinner = Spinner({
                                stream: process.stdout,
                            }).start();

                            plugins = Plugins.installed();

                            spinner.stop();

                            if (plugins.length > 0) {
                                Console.table(plugins.map((item: { [key: string]: any }) => ({
                                    name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                    version: item.version,
                                    path: item.directory,
                                })));
                            } else {
                                Console.warn("no plugins installed");
                            }

                            process.exit();
                        });
                    }

                    break;

                case "ls":
                case "list":
                    if (State.id === "api") {
                        Console.warn("please define a valid instance");

                        return;
                    }

                    spinner = Spinner({
                        stream: process.stdout,
                    }).start();

                    if (!command.instance || command.instance === "") {
                        for (let i = 0; i < State.instances.length; i += 1) {
                            if (State.instances[i].type === "bridge") {
                                State.id = State.instances[i].id;

                                plugins = Plugins.installed();

                                combined = [...combined, ...(plugins.map((item) => ({
                                    instance: State.id,
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

                        spinner.stop();

                        State.id = "api";

                        if (combined.length > 0) {
                            Console.table(combined);
                        } else {
                            Console.warn("no plugins installed");
                        }
                    } else {
                        plugins = Plugins.installed();

                        spinner.stop();

                        if (plugins.length > 0) {
                            Console.table(plugins.map((item) => ({
                                name: item.scope && item.scope !== "" ? `@${item.scope}/${item.name}` : item.name,
                                version: item.version,
                                path: item.directory,
                            })));
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
        .description("show the combined log from the api and instances")
        .option("-i, --instance <name>", "set the instance name")
        .option("-t, --tail <lines>", "set the number of lines")
        .action((command) => {
            if (process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.instances = Instances.list();

            if (State.instances.findIndex((n) => n.id === "api") === -1) {
                Console.warn("system is not initilized, please initilize the system first.");

                return;
            }

            State.timestamps = true;

            const spinner = Spinner({
                stream: process.stdout,
            }).start();

            let instance: string;

            if (command.instance) {
                instance = sanitize(command.instance);
            }

            const messages = Console.load(parseInt(command.tail, 10) || 50, instance!);

            spinner.stop();

            for (let i = 0; i < messages.length; i += 1) {
                if (messages[i].message && messages[i].message !== "") {
                    Console.log(LogLevel.INFO, messages[i]);
                }
            }
        });

    Program.command("config")
        .description("manage the configuration for a given instance")
        .option("-i, --instance <name>", "set the instance name")
        .action(async (command) => {
            if (process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.id = sanitize(command.instance || "api");
            State.instances = Instances.list();

            if (State.instances.findIndex((n) => n.id === "api") === -1) {
                Console.warn("system is not initilized, please initilize the system first.");

                return;
            }

            if (!command.instance || command.instance === "" || State.id === "api") {
                if (State.instances.length === 1) {
                    State.id = State.instances[0].id;
                } else {
                    const { instance } = (await prompt([{
                        type: "list",
                        name: "instance",
                        message: "Please select an instance",
                        choices: State.instances.map((item) => ({
                            name: item.display,
                            value: item.id,
                        })),
                    }]));

                    State.id = instance;
                }
            }

            Editor.nano();
        });

    Program.command("initilize")
        .description("initial setup")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .option("-s, --skip", "skip init system intergration")
        .action(async (command) => {
            if (process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.instances = Instances.list();

            let spinner: Spinner.Ora;
            let instances = [];

            if (State.instances.findIndex((n) => n.id === "api") >= 0) {
                Console.warn("this system is already initilized.");
            } else {
                if (Number.isNaN(parseInt(command.port, 10))) {
                    command.port = parseInt((await prompt([
                        {
                            type: "number",
                            name: "port",
                            default: "50826",
                            message: "enter the port for the api",
                            validate: (value: number | undefined) => {
                                if (!value || Number.isNaN(value)) return "invalid port number";
                                if (value < 1 || value > 65535) return "select a port between 1 and 65535";
                                if (State.instances.findIndex((n) => n.port === value) >= 0) return "port is already in use";

                                return true;
                            },
                        },
                    ])).port, 10);
                }

                Instances.createService("API", parseInt(command.port, 10), command.skip).then((results) => {
                    if (results) {
                        spinner = Spinner({
                            stream: process.stdout,
                        }).start();

                        instances = Instances.list();

                        spinner.stop();

                        if (instances.length > 0) Console.table(instances);
                    } else {
                        Console.error("unable to initilize system.");
                    }

                    process.exit();
                });
            }
        });

    Program.command("instance [action]")
        .description("manage server instances")
        .option("-i, --instance <name>", "set the instance name")
        .option("-p, --port <port>", "change the port the bridge runs on")
        .option("-s, --skip", "skip init system intergration")
        .action(async (action, command) => {
            if (process.env.USER !== "root") {
                Console.warn("you are running in user mode, did you forget to use 'sudo'?");

                return;
            }

            State.instances = Instances.list();

            let spinner: Spinner.Ora;
            let instances = [];

            if (State.instances.findIndex((n) => n.id === "api") === -1) {
                Console.warn("system is not initilized, please initilize the system first.");

                return;
            }

            switch (action) {
                case "add":
                case "create":
                    Instances.createService(command.instance, parseInt(command.port, 10), command.skip).then((results) => {
                        if (results) {
                            spinner = Spinner({
                                stream: process.stdout,
                            }).start();

                            instances = Instances.list();

                            spinner.stop();

                            if (instances.length > 0) {
                                Console.table(instances.map((item) => ({
                                    id: item.id,
                                    type: item.type,
                                    display: item.display,
                                    running: existsSync(join(Paths.storagePath(), `${item.id}.sock`)),
                                    port: item.port,
                                })));
                            }
                        } else {
                            Console.error("unable to create instance.");
                        }

                        process.exit();
                    });

                    break;

                case "rm":
                case "remove":
                    if (!command.instance || command.instance === "") {
                        if (State.instances.filter((item) => item.type === "bridge").length === 1) {
                            command.instance = State.instances.filter((item) => item.type === "bridge")[0].id;
                        } else {
                            const { instance } = (await prompt([{
                                type: "list",
                                name: "instance",
                                message: "Please select an instance",
                                choices: State.instances.filter((item) => item.type === "bridge").map((item) => ({
                                    name: item.display,
                                    value: item.id,
                                })),
                            }]));

                            command.instance = instance;
                        }
                    }

                    if (sanitize(command.instance) !== "api" && !existsSync(join(Paths.storagePath(), `${sanitize(command.instance)}.sock`))) {
                        spinner = Spinner({
                            stream: process.stdout,
                        }).start();

                        Instances.removeService(command.instance, command.skip).then((results) => {
                            if (results) {
                                instances = Instances.list();

                                spinner.stop();

                                if (instances.length > 0) {
                                    Console.table(instances.map((item) => ({
                                        id: item.id,
                                        type: item.type,
                                        display: item.display,
                                        running: existsSync(join(Paths.storagePath(), `${item.id}.sock`)),
                                        port: item.port,
                                    })));
                                }
                            } else {
                                spinner.stop();

                                Console.error("unable to remove instance.");
                            }

                            process.exit();
                        });
                    } else if (sanitize(command.instance) !== "api") {
                        Console.warn("this instance is currently running, shut down this instance before removing.");
                    } else {
                        Console.warn("this is not an instance, to remove the api run a system reset.");
                    }

                    break;

                case "ls":
                case "list":
                    spinner = Spinner({
                        stream: process.stdout,
                    }).start();

                    instances = Instances.list();

                    spinner.stop();

                    if (instances.length > 0) {
                        Console.table(instances.map((item) => ({
                            id: item.id,
                            type: item.type,
                            display: item.display,
                            running: existsSync(join(Paths.storagePath(), `${item.id}.sock`)),
                            port: item.port,
                        })));
                    } else {
                        Console.warn("no instances");
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

            State.instances = Instances.list();

            let spinner: Spinner.Ora;
            let list: { [key: string]: any }[] = [];

            switch (action) {
                case "add":
                case "install":
                    if (State.instances.findIndex((n) => n.id === "api") === -1) {
                        Console.warn("system is not initilized, please initilize the system first.");

                        return;
                    }

                    spinner = Spinner({
                        stream: process.stdout,
                    }).start();

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
                    if (State.instances.findIndex((n) => n.id === "api") === -1) {
                        Console.warn("system is not initilized, please initilize the system first.");

                        return;
                    }

                    spinner = Spinner({
                        stream: process.stdout,
                    }).start();

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
                    if (State.instances.findIndex((n) => n.id === "api") === -1) {
                        Console.warn("system is not initilized, please initilize the system first.");

                        return;
                    }

                    spinner = Spinner({
                        stream: process.stdout,
                    }).start();

                    list = Extentions.list();

                    spinner.stop();

                    Console.table(list);
                    break;

                default:
                    Console.info(Program.helpInformation());
                    break;
            }
        });

    Program.command("system <action> [file]")
        .description("reboot, reset and upgrade this device")
        .action(async (action, file) => {
            if (process.env.USER !== "root") {
                Console.warn("root is required, did you forget to use 'sudo'?");

                return;
            }

            State.instances = Instances.list();

            const flags: string[] = [];
            const list: { [key: string]: any}[] = [];

            let spinner: Spinner.Ora;
            let entries: string[] = [];

            switch (action) {
                case "upgrade":
                    spinner = Spinner({
                        stream: process.stdout,
                    }).start();

                    await Instances.backup();

                    spinner.stop();

                    if (State.manager === "yarn") {
                        flags.push("global");
                        flags.push("upgrade");
                        flags.push("--ignore-engines");
                    } else {
                        flags.push("install");
                        flags.push("-g");
                        flags.push("--unsafe-perm");
                    }

                    execSync(`${State.manager || "npm"} ${flags.join(" ")} @hoobs/hoobsd@latest`, {
                        stdio: "inherit",
                    });

                    execSync(`${State.manager || "npm"} ${flags.join(" ")} @hoobs/cli@latest`, {
                        stdio: "inherit",
                    });

                    if ((Extentions.list().find((item) => item.feature === "gui") || {}).enabled) {
                        execSync(`${State.manager || "npm"} ${flags.join(" ")} @hoobs/gui@latest`, {
                            stdio: "inherit",
                        });
                    }

                    if ((Extentions.list().find((item) => item.feature === "touch") || {}).enabled) {
                        execSync(`${State.manager || "npm"} ${flags.join(" ")} @hoobs/touch@latest`, {
                            stdio: "inherit",
                        });
                    }

                    break;

                case "backup":
                    switch (file) {
                        case "ls":
                        case "list":
                            entries = readdirSync(Paths.backupPath()).filter((item) => item.endsWith(".hbak"));

                            for (let i = 0; i < entries.length; i += 1) {
                                list.push({
                                    date: (new Date(parseInt(entries[i].replace(".hbak", "").replace("backup-", ""), 10))).toLocaleString(),
                                    path: join(Paths.backupPath(), entries[i]),
                                });
                            }

                            if (list.length > 0) {
                                Console.table(list);
                            } else {
                                Console.warn("no backups");
                            }

                            break;

                        default:
                            spinner = Spinner({
                                stream: process.stdout,
                            }).start();

                            Instances.backup().then((filename) => {
                                copyFileSync(
                                    join(Paths.backupPath(), filename),
                                    join(process.cwd(), filename),
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
                        spinner = Spinner({
                            stream: process.stdout,
                        }).start();

                        Instances.restore(file).finally(() => {
                            spinner.stop();

                            Console.info("restore complete");
                        });
                    } else {
                        Console.warn("invalid restore file");
                    }

                    break;

                case "purge":
                    Console.warn("this will remove the connection to homekit, you will need to re-pair");

                    spinner = Spinner({
                        stream: process.stdout,
                    }).start();

                    Instances.purge().then(() => {
                        spinner.stop();

                        Console.info("bridge caches purged");
                        process.exit();
                    });

                    break;

                case "reset":
                    Console.warn("this will remove all settings and plugins, you will need to restore or initilize this device");

                    spinner = Spinner({
                        stream: process.stdout,
                    }).start();

                    Instances.reset();

                    spinner.stop();

                    Console.info("configuration and plugins removed");

                    break;

                default:
                    Console.info(Program.helpInformation());
                    break;
            }
        });

    Program.command("remote")
        .description("start a remote support session")
        .action(() => {
            if (process.env.USER === "root") {
                Console.warn("you are running as root, are you sure?");
            }

            State.instances = Instances.list();

            const client = new Cockpit();

            client.start(true).then((registration) => {
                Console.info(`access code ${registration}`);
            }).catch(() => {
                Console.warn("unable to connect");
            });
        });

    Program.parse(process.argv);
};
