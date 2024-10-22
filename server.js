require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Importar bcryptjs
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Servir archivos estáticos (HTML, CSS, JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors({
    origin: '*',  // Permite cualquier origen
    methods: ['GET', 'POST', 'PUT', 'DELETE'],  // Permite estos métodos
    allowedHeaders: ['Content-Type']  // Permite estos encabezados
}));

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
            setTimeout(handleDisconnect, 2000); // Intentar reconectar después de 2 segundos
        } else {
            console.log('Conexión a la base de datos MySQL establecida.');
            connection.release(); // Liberar la conexión
        }
    });

    db.on('error', (err) => {
        console.error('Error en la base de datos:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect(); // Reconectar en caso de pérdida de conexión
        } else {
            throw err;
        }
    });
}

handleDisconnect();

//Control de Errores en General:
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal en el servidor.');
});

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


// Ruta para registrar un estudiante
app.post('/register', (req, res) => {
    const { nombre, apellido, dni, email, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al hashear la contraseña: ' + err.message });
        }

        const query = 'INSERT INTO estudiantes (nombre, apellido, dni, email, password, activo) VALUES (?, ?, ?, ?, ?, 1)';
        db.query(query, [nombre, apellido, dni, email, hash], (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error al registrar usuario: ' + err.message });
            }
            // Devolver más información, como el ID del usuario
            res.status(201).json({ success: true, message: 'Usuario registrado con éxito', userId: result.insertId });
        });
    });
});

// Ruta para iniciar sesión
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const query = 'SELECT * FROM estudiantes WHERE email = ?';
    
    db.query(query, [email], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al iniciar sesión: ' + err.message });
        }
        if (results.length > 0) {
            const user = results[0];

            // Verificar si el usuario está activo
            if (user.activo === 0) {
                return res.status(401).json({ success: false, message: 'Usuario desactivado. Por favor, comuníquese con el administrador.' });
            }

            console.log('Usuario encontrado:', user);  // Verificar qué usuario se encontró
            
            // Comparar la contraseña ingresada con la contraseña hasheada almacenada
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Error al comparar contraseñas: ' + err.message });
                }
                if (isMatch) {
                    const userData = {
                        id: user.id,
                        nombre: user.nombre,
                        apellido: user.apellido,
                        email: user.email,
                        role: user.role, // Incluye el rol para determinar la redirección
                        activo: user.activo
                    };
                    res.json({ success: true, user: userData });
                } else {
                    res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
        }
    });
});

// Ruta para obtener todas las carreras
app.get('/carreras', (req, res) => {
    const limit = parseInt(req.query.limit) || 10; // Límite de registros por página (default: 10)
    const offset = parseInt(req.query.offset) || 0; // Paginación: inicio de los registros
    const query = 'SELECT * FROM carreras LIMIT ? OFFSET ?';

    db.query(query, [limit, offset], (err, results) => {
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


//Endpoint para que los estudiantes puedan ver en qué materias están matriculados.
app.get('/materias-matriculadas/:usuarioId', (req, res) => {
    const usuarioId = req.params.usuarioId;
    const query = 'SELECT m.nombre FROM inscripciones i JOIN materias m ON i.materia_id = m.id WHERE i.estudiante_id = ? AND i.estado = "activa"';

    db.query(query, [usuarioId], (err, results) => {
        if (err) {
            return res.status(500).send('Error al obtener las materias matriculadas: ' + err.message);
        }
        res.json(results);
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