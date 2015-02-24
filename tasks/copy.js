module.exports = {
  build: {
    src: 'tmp/ember-insights.amd.js',
    dest: 'ember-insights.amd.js',
  },
  tmp: {
    expand: true, cwd: 'ember-insights', src: 'addon/**', dest: 'tmp/'
  }
};
