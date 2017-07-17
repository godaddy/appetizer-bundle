'use strict';

const assume = require('assume');
const Bundle = require('../');
const path = require('path');
const fs = require('fs');

describe('appetizer-bundle', function () {
  const test = path.join(process.cwd(), 'test');
  const fixture = path.join(test, 'fixture');

  let app;

  beforeEach(function () {
    app = new Bundle('fixture', fixture);
  });

  it('is exported as a function', function () {
    assume(Bundle).is.a('function');
  });

  it('sets the directory to the cwd', function () {
    assume(app.dir).equals(fixture);
  });

  describe('#offline', function () {
    this.timeout(100000);

    it('generates an offline bundle', function (next) {
      app.offline(test, next);
    });
  });

  describe('#rewrite', function () {
    it('rewrites and restores the AppDelegate', function (next) {
      const delegate = path.join(app.project, app.name, 'AppDelegate.m');
      const original = fs.readFileSync(delegate, 'utf-8');

      app.rewrite((err, restore) => {
        assume(restore).is.a('function');
        assume(err).is.not.a('error');

        const changed = fs.readFileSync(delegate, 'utf-8');
        assume(changed).does.not.equal(original);

        restore(undefined, (err) => {
          assume(err).is.not.a('error');

          const restored = fs.readFileSync(delegate, 'utf-8');
          assume(restored).equals(original);

          next();
        });
      });
    });
  });

  describe('#xcodebuild', function () {
    this.timeout(200000);

    it('builds the project', function (next) {
      app.xcodebuild(next);
    });
  });

  describe('#xcodeproj', function () {
    it('it finds the xcode project and filename', function (next) {
      app.xcodeproj(path.join(fixture, 'ios'), function (err, project) {
        if (err) return next(err);

        assume(project.name).equals('fixture');
        assume(project.file).equals('fixture.xcodeproj');
        assume(project.workspace).equals(false);

        next();
      });
    });
  });

  describe('#zip', function () {
    it('generates a zip file', function (next) {
      app.zip(function (err, dir) {
        if (err) return next(err);

        assume(dir).includes('fixture.zip');
        next();
      });
    });
  });

  describe('#run', function () {
    //
    // High timeout because we're basically running all steps here.
    //
    this.timeout(300000);

    it('builds the whole application', function (next) {
      app.run(function (err, dir) {
        if (err) return next(err);

        assume(dir).includes('fixture.zip');
        next();
      });
    });
  });

  describe('.release', function () {
    it('is a string', function () {
      assume(app.release).is.a('string');
    });

    it('generates a path to the release builds', function () {
      assume(app.release).includes(app.project);
      assume(app.release).includes('iphonesimulator');
    });
  });
});
