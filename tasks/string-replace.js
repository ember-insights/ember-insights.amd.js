module.exports = {
  dsclean: {
    files: {
      'tmp/ember-insights.amd.js': 'tmp/ember-insights.amd.js'
    },
    options: {
      replacements: [{
        pattern: /\".\//ig,
        replacement: '\"'
      }]
    }
  },
  importTrackerWorkaround: {
    files: {
      'tmp/ember-insights.amd.js': 'tmp/ember-insights.amd.js'
    },
    options: {
      replacements: [{
        pattern: /\"abstract-tracker\"/ig,
        replacement: '"trackers/abstract-tracker"'
      }]
    }
  }
};
