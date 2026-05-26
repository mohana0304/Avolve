module.exports = function (sequelize, DataTypes) {
  const UserSession = sequelize.define('UserSession', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    mobile: {
      type: DataTypes.STRING(15),
      allowNull: false
    },
    sessionId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    deviceId: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    loggedOutAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  });
  return UserSession;
};