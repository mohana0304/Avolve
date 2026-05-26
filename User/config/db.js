const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('avolve', 'postgres', 'Mohana@0304', {
  host: 'localhost',
  dialect: 'postgres',
});

module.exports = sequelize;

