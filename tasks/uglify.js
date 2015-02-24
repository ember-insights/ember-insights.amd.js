module.exports = {
  options: {
    report: 'min',
    wrap: true
  },
  build: {
    files: [
      {
        src: 'ember-insights.amd.js',
        dest: 'ember-insights.amd.min.js',
      },
    ],
  }
};
