// app.js
const express = require('express');
const { Sequelize, DataTypes, UUIDV4 } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// PostgreSQL Connection
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
});

// Gadget Model
const Gadget = sequelize.define('Gadget', {
    id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('Available', 'Deployed', 'Destroyed', 'Decommissioned'),
        defaultValue: 'Available',
    },
    decommissionedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    codename: {
      type: DataTypes.STRING,
      allowNull: true,
    }
});

// User Model (for Authentication)
const User = sequelize.define('User', {
    id: {
        type: DataTypes.UUID,
        defaultValue: UUIDV4,
        primaryKey: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
});

// Authentication Middleware
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1];

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                return res.sendStatus(403);
            }

            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// Routes

// Register User
app.post('/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = await User.create({
            username: req.body.username,
            password: hashedPassword,
        });
        res.status(201).send({ message: 'User created successfully' });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// Login User
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ where: { username: req.body.username } });
        if (!user) {
            return res.status(401).send({ message: 'Invalid credentials' });
        }

        const passwordMatch = await bcrypt.compare(req.body.password, user.password);
        if (!passwordMatch) {
            return res.status(401).send({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.send({ token });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// Gadget Routes (Protected)
app.get('/gadgets', authenticateJWT, async (req, res) => {
    try {
        let gadgets;
        if (req.query.status) {
            gadgets = await Gadget.findAll({ where: { status: req.query.status } });
        } else {
            gadgets = await Gadget.findAll();
        }

        const gadgetsWithProbability = gadgets.map(gadget => ({
            ...gadget.toJSON(),
            missionSuccessProbability: `${Math.floor(Math.random() * 101)}%`,
        }));
        res.send(gadgetsWithProbability);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.post('/gadgets', authenticateJWT, async (req, res) => {
    try {
        const codename = `The ${['Nightingale', 'Kraken', 'Phoenix', 'Viper', 'Specter'][Math.floor(Math.random() * 5)]}`;
        const gadget = await Gadget.create({ ...req.body, codename });
        res.status(201).send(gadget);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.patch('/gadgets/:id', authenticateJWT, async (req, res) => {
    try {
        await Gadget.update(req.body, { where: { id: req.params.id } });
        res.send({ message: 'Gadget updated' });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.delete('/gadgets/:id', authenticateJWT, async (req, res) => {
    try {
        await Gadget.update({ status: 'Decommissioned', decommissionedAt: new Date() }, { where: { id: req.params.id } });
        res.send({ message: 'Gadget decommissioned' });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.post('/gadgets/:id/self-destruct', authenticateJWT, async (req, res) => {
    try {
        const confirmationCode = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        await Gadget.update({ status: 'Destroyed' }, { where: { id: req.params.id } });
        res.send({ message: `Gadget self-destruct initiated. Confirmation code: ${confirmationCode}` });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Sync Database and Start Server
sequelize.sync().then(() => {
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
});
