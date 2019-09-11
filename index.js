'use strict';

const debug = require('diagnostics')('appetizer-bundle');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Bundle the react-native application for Appetize.io uploading.
 *
 * @constructor
 * @param {String} name Name of the application.
 * @param {String} dir Directory of project
 * @param {Object} opts Options.
 * @public
 */
class Bundle {
  constructor(name, dir, opts = {}) {
    this.name = name;
    this.dir = dir || process.cwd();
    this.project = path.join(this.dir, 'ios');
    this.release = path.join(this.project, 'build', 'Build', 'Products', 'Debug-iphonesimulator');

    //
    // Don't actually write to disk.
    //
    this.dryrun = opts.dryrun;
  }

  /**
   * Generate the react-native offline bundle
   *
   * @param {String} dir Location where the offline bundle is placed;
   * @param {Function} next Completion callback.
   * @public
   */
  offline(dir, next) {
    debug('creating an offline bundle in %s', dir);

    const platform = fs.existsSync(path.join(dir, 'index.ios.js'));
    const entry = platform ? 'index.ios.js' : 'index.js';

    this.spawns('react-native', [
      'bundle',
      '--platform',
      'ios',
      '--dev',
      'false',
      '--entry-file',
      entry,
      '--bundle-output',
      dir + '/main.jsbundle',
      '--assets-dest',
      dir
    ], {
      cwd: this.dir
    }, next);
  }

  /**
   * Rewrite the `AppDelegate.m` so it points to the offline bundle.
   *
   * @param {Function} next Completion callback.
   * @public
   */
  rewrite(next) {
    const file = path.join(this.project, this.name, 'AppDelegate.m');

    fs.readFile(file, 'utf-8', (err, data) => {
      if (err) return next(err);

      /**
       * Restore the AppDelegate to it's original state.
       *
       * @param {Error} failure Error that needs to be passed in to the callback.
       * @param {Function} fn Completion callback once restored.
       * @private
       */
      function restore(failure, fn) {
        if (failure) {
          debug(failure);
          debug('something went wrong, rolling back AppDelegate changes');
        }

        fs.writeFile(file, data, 'utf-8', (writeErr) => {
          fn(failure || writeErr);
        });
      }

      //
      // Update the code location to the new bundle location.
      //
      const changes = data.split('\n').map((line) => {
        if (!~line.indexOf('jsBundleURLForBundleRoot:@"index.')) return line;

        //
        // React-Native is always actively iterated upon, that means that the
        // code structure of this file is also iterated upon. We want to support
        // as many versions as possible so we need to drill down further here to
        // ensure that we return the correct new bundle location.
        //
        if (!!~line.indexOf('jsCodeLocation')) {
          return '  jsCodeLocation = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];';
        }

        return '  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];'
      }).join('\n');

      debug('updated the AppDelegate to ', changes);

      fs.writeFile(file, changes, 'UTF-8', (writeErr) => {
        if (writeErr) return next(writeErr, restore);

        next(writeErr, restore);
      });
    });
  }

  /**
   * Generate a zipfile from the resulting application build.
   *
   * @param {Function} next Completion callback.
   * @public
   */
  zip(next) {
    const release = this.release;
    const input = path.join(release, this.name + '.app');
    const output = path.join(release, this.name + '.zip');

    this.spawns('zip', [
      '-r',
      output,
      input
    ], {
      cwd: this.dir
    }, (err) => {
      next(err, output);
    });
  }

  /**
   * Finds the xcodeproject files.
   *
   * @param {String} dir Location of the directory.
   * @param {Function} next Completion callback.
   * @public
   */
  xcodeproj(dir, next) {
    const name = this.name;

    fs.readdir(dir, function readdir(err, files) {
      if (err) return next(err);

      function search(target) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const ext = path.extname(file);

          if (ext === target) return file;
        }

        return false;
      }

      const workspace = search('.xcworkspace');
      const project = search('.xcodeprojx');
      let result;

      if (workspace) {
        result = { file: workspace, name, workspace: true };
      } else if (project) {
        result = { file: project, name, workspace: false };
      }

      if (result) return next(err, result);
      next(new Error('Unable to locate xcode project files.'));
    });
  }

  /**
   * Build the xcode project so we can create the iphone simulator app.
   *
   * @param {Function} next Completion callback.
   * @public
   */
  xcodebuild(next) {
    const dir = path.join(this.dir, 'ios');

    this.xcodeproj(dir, (err, project) => {
      if (err) return next(err);

      console.log(project);

      this.spawns('xcodebuild', [
        project.workspace ? '-workspace' : '-project', project.file,
        '-sdk', 'iphonesimulator',
        '-configuration', 'Debug',
        '-scheme', project.name,
        '-derivedDataPath', `build/${project.name}`
      ], {
        cwd: dir,

        //
        // Prevent the build process from launching the packager as we're using
        // a pre-bundled/packaged build
        //
        // https://github.com/facebook/react-native/blob/242d29d37486054ee31304db85660fca43027a1c/local-cli/runIOS/runIOS.js#L200-L208
        //
        env: Object.assign({}, process.env, { RCT_NO_LAUNCH_PACKAGER: true })
      }, next);
    });
  }

  /**
   * Small wrapper around spawn to deal with all the stream callback tracking so
   * we can just have a single callback function.
   *
   * @param {String} cmd The cmd we want to execute.
   * @param {Array} flags flags for the cmd.
   * @param {Object} opts Options.
   * @param {Function} fn Completion callback.
   * @private
   */
  spawns(cmd, flags, opts, fn) {
    debug('spawning command', cmd, flags);

    const stream = spawn(cmd, flags, opts);

    const errs = [];
    const data = [];

    stream.stderr.on('data', (line) => {
      line = line.toString();

      debug('[%s] received error', cmd, line);

      errs.push(line);
    });

    stream.stdout.on('data', (line) => {
      line = line.toString();
      debug('[%s] received data', cmd, line);

      data.push(line);
    });

    stream.once('close', (code) => {
      debug('[%s] closed with code: ', cmd, code);
      if (+code !== 0) return fn(new Error(errs.join('\n') || 'Recieved a non 0 exit code'));

      fn(undefined, data.join('\n'));
    });
  }

  /**
   * Run the various of build steps.
   *
   * @param {Function} fn Completion callback.
   * @public
   */
  run(fn) {
    const dir = path.join(this.release, this.name +'.app');

    this.rewrite((errWrite, restore) => {
      if (errWrite) return restore(errWrite, fn);

      this.xcodebuild((errBuild) => {
        if (errBuild) return restore(errBuild, fn);

        this.offline(dir, (errOffline) => {
          if (errOffline) return restore(errOffline, fn);

          this.zip((errZip, dir) => {
            restore(errZip, (restoreErr) => {
              fn(restoreErr, dir);
            });
          });
        });
      });
    });
  }
}

//
// Expose the module.
//
module.exports = Bundle;
