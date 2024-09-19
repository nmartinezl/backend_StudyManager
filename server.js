require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const bcrypt = require('bcryptjs');// Importar bcryptjs
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Servir archivos estáticos (HTML, CSS, JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de la base de datos 
const db = mysql.createConnection({
    host: process.env.DB_HOST,  // Usar las variables de entorno
    user: process.env.DB_USER,                
    password: process.env.DB_PASSWORD,               
    database: process.env.DB_DATABASE,            
    port: 3306 // puerto de la base de datos en freesql
});

db.connect((err) => {
    if (err) {
        console.error('Error conectando a la base de datos:', err);
        return;
    }
    console.log('Conectado a la base de datos MySQL en localhost.');

    // Verificar si el usuario admin ya existe
    const adminEmail = 'admin@admin.com';
    const adminPassword = '1234';  // Contraseña por defecto

    db.query('SELECT * FROM estudiantes WHERE email = ?', [adminEmail], (err, results) => {
        if (err) {
            console.error('Error al verificar el usuario admin:', err);
            return;
        }
        if (results.length === 0) {
            // Si el usuario admin no existe, lo creamos
            bcrypt.hash(adminPassword, 10, (err, hash) => {  // Hasheamos la contraseña
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
});


// Ruta para registrar un estudiante
app.post('/register', (req, res) => {
    const { nombre, apellido, dni, email, password } = req.body;

    // Hashear la contraseña antes de guardarla
    bcrypt.hash(password, 10, (err, hash) => {  // 10 es el número de rondas de sal para bcrypt
        if (err) {
            return res.status(500).send('Error al hashear la contraseña: ' + err.message);
        }

        // Insertar el usuario con la contraseña hasheada
        const query = 'INSERT INTO estudiantes (nombre, apellido, dni, email, password, activo) VALUES (?, ?, ?, ?, ?, 1)';
        db.query(query, [nombre, apellido, dni, email, hash], (err, result) => {
            if (err) {
                return res.status(500).send('Error al registrar usuario: ' + err.message);
            }
            res.send('Usuario registrado con éxito');
        });
    });
});

// Ruta para iniciar sesión
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM estudiantes WHERE email = ?';
    
    db.query(query, [email], (err, results) => {
        if (err) {
            return res.status(500).send('Error al iniciar sesión: ' + err.message);
        }
        if (results.length > 0) {
            console.log('Usuario encontrado:', results[0]);  // Verificar qué usuario se encontró
            // Comparar la contraseña ingresada con la contraseña hasheada almacenada
            bcrypt.compare(password, results[0].password, (err, isMatch) => {
                if (err) {
                    return res.status(500).send('Error al comparar contraseñas: ' + err.message);
                }
                if (isMatch) {
                    res.send('Inicio de sesión exitoso');
                } else {
                    console.log('Contraseña incorrecta');  // Mensaje de depuración
                    res.status(401).send('Correo o contraseña incorrectos');
                }
            });
        } else {
            console.log('Usuario no encontrado');  // Mensaje de depuración
            res.status(401).send('Correo o contraseña incorrectos');
        }
    });
});

// Lo nuevo
// Ruta para obtener todas las carreras
app.get('/carreras', (req, res) => {
    const query = 'SELECT * FROM carreras';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).send('Error al obtener las carreras: ' + err.message);
        }
        res.json(results);  // Devolver las carreras como JSON
    });
});

// Ruta para obtener los años disponibles para una carrera
app.get('/anios/:carreraId', (req, res) => {
    const carreraId = req.params.carreraId;
    const query = 'SELECT DISTINCT anio FROM materias WHERE carrera_id = ? ORDER BY anio';
    db.query(query, [carreraId], (err, results) => {
        if (err) {
            return res.status(500).send('Error al obtener los años: ' + err.message);
        }
        const anios = results.map(row => row.anio);
        res.json(anios);  // Devolver los años como JSON
    });
});

// Ruta para obtener las materias de un año específico de una carrera
app.get('/materias/:carreraId/:anio', (req, res) => {
    const carreraId = req.params.carreraId;
    const anio = req.params.anio;
    const query = 'SELECT * FROM materias WHERE carrera_id = ? AND anio = ?';
    db.query(query, [carreraId, anio], (err, results) => {
        if (err) {
            return res.status(500).send('Error al obtener las materias: ' + err.message);
        }
        res.json(results);  // Devolver las materias como JSON
    });
});



/// Ruta para matricular a un usuario en una materia
app.post('/matricular', (req, res) => {
    const { usuarioId, materiaId } = req.body;  // Obtener el ID del usuario y de la materia desde el cuerpo de la solicitud

    // Primero, verificar si la materia existe y obtener su nombre
    const materiaQuery = 'SELECT nombre FROM materias WHERE id = ?';
    db.query(materiaQuery, [materiaId], (err, materiaResults) => {
        if (err) {
            return res.status(500).send('Error al verificar la materia: ' + err.message);
        }
        if (materiaResults.length === 0) {
            return res.status(404).send('La materia no existe');
        }

        const nombreMateria = materiaResults[0].nombre;

        // Luego, insertar la inscripción
        const query = 'INSERT INTO inscripciones (estudiante_id, materia_id, estado) VALUES (?, ?, ?)';
        db.query(query, [usuarioId, materiaId, 'activa'], (err, result) => {  // Insertar con estado 'activa'
            if (err) {
                return res.status(500).send('Error al matricular al usuario: ' + err.message);
            }
            res.send(`Usuario matriculado con éxito en la materia: ${nombreMateria}`);
        });
    });
});

// Ruta para la página de inicio
app.get('/', (req, res) => {
    res.send('<h1>Bienvenido al backend de Study Manager</h1><p>Esta es la API del backend, consulta la documentación para usar los endpoints disponibles.</p>');
});

// Escuchar en el puerto 3000
app.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
});
