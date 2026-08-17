module.exports = {
  hooks: {
    readPackageJson: async (pkg) => {
      if (pkg.name === 'unrs-resolver') {
        delete pkg.scripts;
      }
      return pkg;
    },
  },
};
