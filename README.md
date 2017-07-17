# appetizer-bundle

Creates an uploadable bundle of your React-Native application so it can run on
the appetize.io platform. It currently only supports `ios` builds. Please note
that this module assumes you have a iOS build tool chain installed on your
system. As it needs to have access to the following CLI's:

- `zip`
- `xcodebuild`

## Installation

```
npm install --save appetizer-bundle
```

## API

The following arguments are required in the `Bundle` constructor:

- `name` The name of your application as you configured it with `react-native init`
- `dir` The root directory of your React-Native app, this contains the `ios` and
  `android` folders.

```js
const Bundle = require('appetizer-bundle');
const bundle = new Bundle('name of your application', 'path to your app dir');
```

### run

This is the method that most people would be using, it chains all other
methods in the correct order to generate a new build:

1. Rewrite the Delegate function so your app uses the offline bundle.
2. Create a new xcodebuild of the updated manifest.
3. Create the offline React-Native bundle.
4. Zip the resulting application.
5. Rewind all changes made to the app so it's the in the previous state.

```js
bundle.run(function (err, zipfile) {
  if (err) {
    // Handle errors
  }

  //
  // Upload zipfile location using the appetizer library
  //
});
```

### offline

Generates the offline React-Native bundle. The method expects 2 arguments:

1. The directory in which the resulting offline bundle should be placed
2. Completion callback

```js
bundle.offline(dir, (err) => {
  if (err) {
    // Handle errors
  }

});
```

### rewrite

Rewrites the `AppDelegate.m` so it points to new React-Native offline bundle.
The rewrite function is a bit special. It receives a `restore` function as
second argument which restores the `AppDelegate.m` to it's original state.

The `restore` function accepts the following arguments:

- `err` An error that will be passed in the completion argument so you can clean
  up, and forward it to the callback.
- `next` Completion callback.

```js
bundle.rewrite((err, restore) => {
  if (err) {
    // Handle errors
  }

  restore(err, function (err) {
    if (err) {
      // Handle errors
    }

  });
});
```

### zip

Packs the resulting the application in a zip file so it can easily be uploaded
to the appetize.io service as it only accepts `zip` or `tar` files. The zip
callback receives the full path to the generated zip file as result.

```js
bundle.zip(function (err, zipfilelocation) {
  if (err) {
    // Handle errors
  }
  
  //
  // Upload zipfile location using the appetizer library
  //
});
```

### xcodeproj

Read the given project directory and check if we have an xcode project or
workspace we're dealing with. It requires the following arguments.

- `dir` The location where the project files should be located in.
- `fn` Completion callback that receives error and a project object.

The project object contains the following information:

- `name` Name of the file
- `file` Full file name
- `workspace` Boolean indication if its a workspace.

```js
bundle.xcodeproj(dir, function (err, project) {
  if (err) {
    // Handle errors
  }

  console.log(project.file);
});
```

### xcodebuild

Generate a new iphonesimulator compatible xcode build. It expects a single
argument which is an error first completion callback.

```js
bundle.xcodebuild(function (err) {
  if (err) {
    // Handle errors
  }

});
```

## License

MIT
