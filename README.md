# ![](https://raw.githubusercontent.com/hoobs-org/HOOBS/master/docs/logo.png)

The HOOBS command line interface is the software that managess bridge instances. Below is a list of commands and actions available in the HOOBS CLI.

## **initilize**
This initilizes the system. It creates the special API instance. The API instance is a control hub for all other instances.

```
sudo hoobs initilize
```

Available options
| Flag              | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| -p, --port <port> | Sets the port for the API, if not set the CLI will ask you |
| -s, --skip        | This will skip the systemd or launchd service create       |
| -c, --container   | This changes the paths needed for Docker containers        |

## **instance [action]**
This controls instances on the system. It can be used to list, create and remove instances.

> This also creates and starts systemd and launchd services. If your system doesn't have either of these systems, the CLI will not attempt this.

#### **create**
This will create an instance.

```
sudo hoobs instance create
```

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -i, --instance <name> | Defines a name for the instance                      |
| -p, --port <port>     | Sets the port for the instance                       |
| -s, --skip            | This will skip the systemd or launchd service create |
| -c, --container       | This changes the paths needed for Docker containers  |

> If the instance name or port is not set the CLI will ask for this information.

#### **remove**
This will remove an instance.

```
sudo hoobs instance remove
```

> This will remove all configs and plugins.

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -i, --instance <name> | Defines instance to be removed                       |
| -s, --skip            | This will skip the systemd or launchd service create |
| -c, --container       | This changes the paths needed for Docker containers  |

> If the instance name is not set the CLI will ask for this information.

#### **list**
This will show a list of instances on the system including the API. It will also show you if the instance is running.

```
sudo hoobs instance list
```

## **plugin [action]**
This allows you to install, remove and list plugins from any instance.

This will manage the plugin locations, logging and configs. This important because HOOBS encrypts your config files.

> Even though you can install plugins using npm or yarn, this handles everything that those tools don't This plugin command is a more secure way of installing plugins.

#### **add [name]**
This will install a plugin into an instance.

```
sudo hoobs plugin add my-plugin
```

You can also define a version using the standard syntax `my-plugin@1.0.0`.

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -i, --instance <name> | Defines instance to install this plugin              |
| -c, --container       | This changes the paths needed for Docker containers  |

> If the instance name is not set the CLI will ask for this information.

#### **remove [name]**
This will uninstall a plugin from an instance.

```
sudo hoobs plugin remove my-plugin
```

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -i, --instance <name> | Defines instance to install this plugin              |
| -c, --container       | This changes the paths needed for Docker containers  |

> If the instance name is not set the CLI will ask for this information.

#### **upgrade <name>**
This will upgrade a single plugin or all plugins from an instance.

```
sudo hoobs plugin upgrade
```

or

```
sudo hoobs plugin upgrade my-plugin
```

You can also define a version using the standard syntax `my-plugin@1.0.0`.

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -i, --instance <name> | Defines instance to upgrade                          |
| -c, --container       | This changes the paths needed for Docker containers  |

> If the instance name is not set the CLI will ask for this information.

#### **list**
This will list plugins for all or a single instance.

```
sudo hoobs plugin list
```

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -i, --instance <name> | Defines the instance to list                         |
| -c, --container       | This changes the paths needed for Docker containers  |

> If an instance is not defined, the CLI will include the instance in the list.

#### **create**
This command is used by developers to quickly create a new plugin project. It will create a new folder for your project and add example files depending on the options you choose.

```
cd ~/projects
hoobs plugin create
```

This supports many options.
* JavaScript
* Typescript
* Eslint
* Jest
* Nodemon
* GUI plugin
* Config Schemas

## **config**
This allows you to manually configure HOOBS. This is the only way other then the GUI to configure HOOBS. HOOBS encrypts config files to project sensitive information.

```
sudo hoobs config
```

This command can configure the API as well as instances.

> This uses nano, you may need to install it on your system.

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -i, --instance <name> | Defines the instance to configure                    |
| -c, --container       | This changes the paths needed for Docker containers  |

> If the instance name is not set the CLI will ask for this information.

## **log**
This will display the log from all instances. You can also use this command to show the log from a single instance.

```
sudo hoobs log
```

You can also display debug information after the fact. This comes in handy if you can't tuen on debug mode.

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -i, --instance <name> | Show the log from a single instance                  |
| -t, --tail <lines>    | Set the number of lines to show, default 50          |
| -d, --debug           | Show debug messages                                  |
| -c, --container       | This changes the paths needed for Docker containers  |

## **extention [action]**
This manages HOOBS extentions (features). It can be used to enable system level dependencies, like FFMPEG, and the official GUI.

> Extentions are not the same as plugins. A plugin runs on a bridge, where an extention runs on the system, or modifies the API.

#### **add [name]**
This enables an extention.

```
sudo hoobs extention add ffmpeg
```

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -c, --container       | This changes the paths needed for Docker containers  |

#### **remove [name]**
This disables an extention.

```
sudo hoobs extention remove ffmpeg
```

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -c, --container       | This changes the paths needed for Docker containers  |

#### **list**
This will list all available extetntions and if they are enabled.

```
sudo hoobs extention list
```

Available options
| Flag                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| -c, --container       | This changes the paths needed for Docker containers  |

## **system <action>**
This command manages the system. You can upgrade HOOBS, backuup and restore the system. You can also clean the caches or completly reset the system.

#### **upgrade**
This will upgrade HOOBS to the latest version.

```
sudo hoobs system upgrade
```

#### **backup**
This will backup your current setup to the filder you run it from.

```
cd ~/backups
sudo hoobs system backup
```

> Note this will need to be ran with elevated permissions. You will need to chmod the file if you want to work with it.

#### **restore <file>**
This will restore the system with the file you select

```
sudo hoobs system restore ~/backups/my-backup.zip
```

#### **clean**
This will clean all persisted and cache files from all instances.

```
sudo hoobs system clean
```

> This will require you to re-pair with Apple Home.

#### **reset**
This will remove all configurations, plugins and instances from the system. Yse this with caution.

```
sudo hoobs system reset
```

> This will keep you backup folder, so it is wise to create a backup before running this command.

#### **sockets**
This will list all open sockets used by HOOBS. This is helpful for debugging instances that will not start.

```
sudo hoobs system sockets
```

## **remote**
This will start a remote terminal session with HOOBS support.

```
hoobs remote
```

> It is not wise using this command with sudo.