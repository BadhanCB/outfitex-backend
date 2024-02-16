const slugify = (string) =>
    string.toLowerCase().replace(/[^a-z0-9-]+/g, "-") +
    "-" +
    Math.round(Math.random() * (999999 - 100000) + 100000).toString();

module.exports = { slugify };
