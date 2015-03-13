module.exports = {
  options: {
    report: 'min', wrap: true, sourceMap: true, mangle: false
  },
  build: {
    files: [
      { src: 'ember-insights.amd.js', dest: 'ember-insights.amd.min.js' },
    ],
  }
};
