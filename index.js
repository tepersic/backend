import express from 'express';
import cors from 'cors';
import { connectToDatabase } from './db.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes.js';
import { authenticateUser } from './middleware/authMiddleware.js';
dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            "http://localhost:5173", // Local development
            "https://your-production-domain.com" // Replace with your production frontend URL
        ];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true // Allow cookies and authentication headers
}));

app.use((req, res, next) => {
    const allowedOrigins = [
        "http://localhost:5173", // Local development
        "https://your-production-domain.com" // Replace with your production frontend URL
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true"); // Allow credentials (token, cookies)
    next();
});

let db;
async function initializeDatabase() {
    const { client, db: database } = await connectToDatabase();
    db = database;
}
initializeDatabase();
const PORT = 3000;


app.get('/auth/user', authenticateUser, (req, res) => {
    if (req.user) {
        res.json({ ...req.user, admin: req.user.admin }); // Include admin status
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
});

app.get('/profesori', async (req, res) => {
  try {
      const profesori_collection = db.collection('profesori');
      const profesori = await profesori_collection.find({}, { projection: { profesor: 1, fakultet: 1 } }).toArray();
      
      console.log("Dohvaćeni profesori:", profesori); 

      res.status(200).json(profesori);
  } catch (error) {
      console.error("Greška pri dohvaćanju profesora:", error);
      res.status(500).json({ error: "Interna greška servera" });
  }
});


app.get('/profesori/:id', async (req, res) => {
  try {
      let profesori_collection = db.collection('profesori');
      let komentari_collection = db.collection('komentari');

      let profesor = await profesori_collection.findOne({ _id: new ObjectId(req.params.id) });

      if (!profesor) {
          return res.status(404).json({ error: "Profesor nije pronađen" });
      }

      // Dohvati komentare tog profesora
      let komentari = await komentari_collection.find({ profesorId: req.params.id }).toArray();

      // Izračunaj prosječnu ocjenu
      let prosjecnaOcjena = 0;
      if (komentari.length > 0) {
          let suma = komentari.reduce((acc, komentar) => acc + komentar.ocjena, 0);
          prosjecnaOcjena = suma / komentari.length;
      }

      res.status(200).json({
          profesor: profesor.profesor,
          fakultet: profesor.fakultet,
          zvanje: profesor.zvanje,
          slika: profesor.slika,
          prijediplomski_kolegij: profesor.prijediplomski_kolegij || [],
          diplomski_kolegij: profesor.diplomski_kolegij || [],
          ocjena: prosjecnaOcjena.toFixed(1),
          komentari: komentari || []
      });
  } catch (error) {
      console.error("Greška pri dohvaćanju profesora:", error);
      res.status(500).json({ error: "Interna greška servera" });
  }
});


// Dodaj komentar za profesora
app.post('/profesori/:id/komentari', authenticateUser, async (req, res) => {
    const { ocjena, tekst } = req.body;
    const userId = req.user.id; // Get user ID from the token

    // Validate input
    if (!ocjena || !tekst) {
        return res.status(400).json({ error: "Svi podaci su obavezni" });
    }

    if (isNaN(ocjena) || ocjena < 1 || ocjena > 10) {
        return res.status(400).json({ error: "Ocjena mora biti broj između 1 i 10" });
    }

    try {
        const komentariCollection = db.collection('komentari');
        const usersCollection = db.collection('korisnici'); // Assuming users collection is called 'korisnici'

        // Check if user already commented
        const existingComment = await komentariCollection.findOne({ profesorId: req.params.id, userId });

        if (existingComment) {
            // Update existing comment
            await komentariCollection.updateOne(
                { profesorId: req.params.id, userId },
                { $set: { ocjena: parseInt(ocjena), tekst } }
            );
            return res.json({ message: "Komentar ažuriran!" });
        }

        // Get user details
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(400).json({ error: "Korisnik nije pronađen" });
        }

        // Insert new comment
        const noviKomentar = {
            profesorId: req.params.id,
            userId, // Store user ID
            userName: user.name, // Store the user's name
            ocjena: parseInt(ocjena),
            tekst
        };

        await komentariCollection.insertOne(noviKomentar);
        res.status(201).json(noviKomentar);
    } catch (error) {
        console.error("Greška pri dodavanju komentara:", error);
        res.status(500).json({ error: "Interna greška servera" });
    }
});
app.use('/api', userRoutes);

app.listen(PORT, () => {
    console.log(`Server radi na portu ${PORT}`);
});