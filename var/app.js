// $hoobs is defined in the sdk.js file
// to access hoobsd you must call setup()
$hoobs.config.setup();

async function login() {
    // you can call your routes defined in the routes.js file
    // $bridge is injected from the parent and must be included
    // the plugin name is the same value from your package.json
    const response = await $hoobs.plugin($bridge, "[plugin name]", "[route]", { /* request.body */ });

    // you can fetch the current config from the sdk
    // this will be the config from this plugin only
    // you plugin must be a platform type for this to work
    const config = await $hoobs.config.get();

    // after you set some values, you can call this method to save
    await $hoobs.config.update(config);

    // note: updating the config will auto restart the current bridge
    // it is best to call this once after you are done updating

    // you can also update the value you have the button configured
    // updating the $value will not auto save the config ($hoobs.config is recommended for updating config values)
    $value = "hello world";
}

function close() {
    // $close is injected from the parent
    // passing in true will reload the config screen
    $close(true);
}
