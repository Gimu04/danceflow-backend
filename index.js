const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// ==========================================
// ESTUDIANTES
// ==========================================
app.get('/api/estudiantes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM estudiantes ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener estudiantes' });
    }
});

app.post('/api/estudiantes', async (req, res) => {
    try {
        const { nombre, apellido, email, telefono, nivel_actual } = req.body;
        const query = `
            INSERT INTO estudiantes (nombre, apellido, email, telefono, nivel_actual) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const result = await pool.query(query, [nombre, apellido, email, telefono, nivel_actual || 'Principiante']);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear estudiante' });
    }
});

// ==========================================
// INSTRUCTORES
// ==========================================
app.get('/api/instructores', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM instructores ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener instructores' });
    }
});

app.post('/api/instructores', async (req, res) => {
    try {
        const { nombre, especialidad, telefono } = req.body;
        const query = 'INSERT INTO instructores (nombre, especialidad, telefono) VALUES ($1, $2, $3) RETURNING *;';
        const result = await pool.query(query, [nombre, especialidad, telefono]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear instructor' });
    }
});

// ==========================================
// CLASES
// ==========================================
app.get('/api/clases', async (req, res) => {
    try {
        const query = `
            SELECT c.id, c.estilo, c.nivel, c.dia_semana, c.hora_inicio, i.nombre AS instructor 
            FROM clases c
            LEFT JOIN instructores i ON c.instructor_id = i.id;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener clases' });
    }
});

app.post('/api/clases', async (req, res) => {
    try {
        const { estilo, nivel, dia_semana, hora_inicio, instructor_id } = req.body;
        const query = `
            INSERT INTO clases (estilo, nivel, dia_semana, hora_inicio, instructor_id)
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const result = await pool.query(query, [estilo, nivel, dia_semana, hora_inicio, instructor_id]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear la clase' });
    }
});

// ==========================================
// INSCRIPCIONES (Inscribir Estudiante a Clase)
// ==========================================
app.get('/api/inscripciones', async (req, res) => {
    try {
        const query = `
            SELECT ins.id, e.nombre || ' ' || e.apellido AS estudiante, c.estilo, c.nivel, ins.fecha_inscripcion
            FROM inscripciones ins
            JOIN estudiantes e ON ins.estudiante_id = e.id
            JOIN clases c ON ins.clase_id = c.id
            ORDER BY ins.fecha_inscripcion DESC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener inscripciones' });
    }
});

app.post('/api/inscripciones', async (req, res) => {
    try {
        const { estudiante_id, clase_id } = req.body;
        const query = 'INSERT INTO inscripciones (estudiante_id, clase_id) VALUES ($1, $2) RETURNING *;';
        const result = await pool.query(query, [estudiante_id, clase_id]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(400).json({ error: 'El estudiante ya está inscrito en esta clase o datos inválidos.' });
    }
});

app.get('/api/clases/:claseId/estudiantes', async (req, res) => {
    try {
        const { claseId } = req.params;
        const query = `
            SELECT e.id, e.nombre, e.apellido 
            FROM inscripciones ins
            JOIN estudiantes e ON ins.estudiante_id = e.id
            WHERE ins.clase_id = $1
            AND e.id NOT IN (
                SELECT estudiante_id FROM asistencias 
                WHERE clase_id = $1 AND fecha::date = CURRENT_DATE
            );
        `;
        const result = await pool.query(query, [claseId]);
        res.json(result.rows);
    } catch (error) {
        console.error("🚨 ERROR FILTRANDO ESTUDIANTES:", error.message);
        res.status(500).json({ error: 'Error al filtrar estudiantes inscritos' });
    }
});

// ==========================================
// ASISTENCIAS
// ==========================================


// Guardar asistencia validando duplicados
app.post('/api/asistencias', async (req, res) => {
    try {
        const { estudiante_id, clase_id, estado } = req.body;
        
        // Validación extra de seguridad en el backend
        const check = await pool.query(
            'SELECT id FROM asistencias WHERE estudiante_id = $1 AND clase_id = $2 AND fecha::date = CURRENT_DATE',
            [estudiante_id, clase_id]
        );
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'El estudiante ya tiene un registro de asistencia hoy en esta clase.' });
        }
        
        const query = `
            INSERT INTO asistencias (estudiante_id, clase_id, estado)
            VALUES ($1, $2, $3) RETURNING *;
        `;
        const result = await pool.query(query, [estudiante_id, clase_id, estado || 'Asistió']);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        // AQUÍ ESTÁ LA CLAVE: Esto imprimirá el error real en tu terminal
        console.error("🚨 ERROR REAL EN BD:", error.message); 
        res.status(500).json({ error: 'Error interno al registrar la asistencia' });
    }
});

app.get('/api/asistencias', async (req, res) => {
    try {
        const query = `
            SELECT a.id, e.nombre || ' ' || e.apellido AS estudiante, c.estilo, c.nivel, a.fecha, a.estado
            FROM asistencias a
            JOIN estudiantes e ON a.estudiante_id = e.id
            JOIN clases c ON a.clase_id = c.id
            ORDER BY a.fecha DESC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener asistencias' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de DanceFlow corriendo en el puerto ${PORT} 🕺💃`);
});