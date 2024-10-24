require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Crear un pool de conexiones
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: 3306
});

// Manejo de reconexiones automáticas
function handleDisconnect() {
    db.getConnection((err, connection) => {
        if (err) {
            console.error('Error al conectar a la base de datos:', err);
            setTimeout(handleDisconnect, 2000);
        } else {
            console.log('Conexión a la base de datos MySQL establecida.');
            connection.release();
        }
    });

    db.on('error', (err) => {
        console.error('Error en la base de datos:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

handleDisconnect();

// Verificar si el usuario admin ya existe y crearlo si no
const adminEmail = 'admin@admin.com';
const adminPassword = '1234';

db.query('SELECT * FROM estudiantes WHERE email = ?', [adminEmail], (err, results) => {
    if (err) {
        console.error('Error al verificar el usuario admin:', err);
        return;
    }
    if (results.length === 0) {
        bcrypt.hash(adminPassword, 10, (err, hash) => {
            if (err) {
                console.error('Error al hashear la contraseña de admin:', err);
                return;
            }

            const query = 'INSERT INTO estudiantes (nombre, apellido, dni, email, password, activo) VALUES (?, ?, ?, ?, ?, 1)';
            db.query(query, ['Admin', 'Admin', '00000000', adminEmail, hash], (err, result) => {
                if (err) {
                    console.error('Error al crear el usuario admin:', err);
                    return;
                }
                console.log('Usuario admin creado por defecto.');
            });
        });
    } else {
        console.log('El usuario admin ya existe.');
    }
});

// Ruta para registrar un estudiante
app.post('/register', (req, res) => {
    const { nombre, apellido, dni, email, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al hashear la contraseña' });
        }

        const query = 'INSERT INTO estudiantes (nombre, apellido, dni, email, password, activo) VALUES (?, ?, ?, ?, ?, 1)';
        db.query(query, [nombre, apellido, dni, email, hash], (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error al registrar usuario' });
            }
            res.status(201).json({ success: true, message: 'Usuario registrado con éxito' });
        });
    });
});

// Ruta para iniciar sesión
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM estudiantes WHERE email = ?';
    
    db.query(query, [email], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al iniciar sesión' });
        }
        if (results.length > 0) {
            const user = results[0];

            if (user.activo === 0) {
                return res.status(401).json({ success: false, message: 'Usuario desactivado' });
            }

            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Error al comparar contraseñas' });
                }
                if (isMatch) {
                    if (user.nombre === 'Admin') {
                        res.json({ success: true, role: 'admin' });
                    } else {
                        res.json({ success: true, role: 'user' });
                    }
                } else {
                    res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
        }
    });
});

// Ruta para la página de inicio
app.get('/', (req, res) => {
    res.send('<h1>Bienvenido al backend de Study Manager</h1><p>Esta es la API del backend, consulta la documentación para usar los endpoints disponibles.</p>');
});

// Puerto para la API en RAILWAY
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});

// Keep-alive para conexiones
server.keepAliveTimeout = 60000 * 2; // 2 minutos de timeout