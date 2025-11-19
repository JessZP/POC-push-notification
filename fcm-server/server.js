const express = require("express");
const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const app = express();

app.use(express.json());

// -------------------------
// LowDB v1 (persistência simples em JSON)
// -------------------------
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

// Cria estrutura inicial se não existir
db.defaults({ students: {} }).write();

// Carrega estado atual dos students
let students = db.get("students").value();

// Inicializa dados default se estiver vazio
if (Object.keys(students).length === 0) {
  db.set("students", {
    "poc1qa123456": { token: "", partner: "", environment: "", courses: ["123"], version: "" },
    "poc1staging123456": { token: "", partner: "", environment: "", courses: ["456"], version: "" },
    "poc1release123456": { token: "", partner: "", environment: "", courses: ["789"], version: "" },
    "poc2qa123456": { token: "", partner: "", environment: "", courses: ["321"], version: "" },
    "poc2staging123456": { token: "", partner: "", environment: "", courses: ["654"], version: "" },
    "poc2release123456": { token: "", partner: "", environment: "", courses: ["987"], version: "" }
  }).write();

  students = db.get("students").value();
}

/**
 * Inicialização dos dois projetos Firebase com a API nova
 */
if (!process.env.FIREBASE_SERVICE_ACCOUNT_POC1 || !process.env.FIREBASE_SERVICE_ACCOUNT_POC2) {
  throw new Error("É necessário definir as variáveis FIREBASE_SERVICE_ACCOUNT_POC1 e FIREBASE_SERVICE_ACCOUNT_POC2");
}

const serviceAccountPoc1 = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_POC1);
const serviceAccountPoc2 = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_POC2);

const poc1App = initializeApp(
  { credential: cert(serviceAccountPoc1) },
  "poc1"
);

const poc2App = initializeApp(
  { credential: cert(serviceAccountPoc2) },
  "poc2"
);

/**
 * Helper para selecionar o projeto correto
 */
function getFirebaseApp(partner) {
  if (partner === "poc1") return poc1App;
  if (partner === "poc2") return poc2App;
  throw new Error("Parceiro inválido. Use 'poc1' ou 'poc2'.");
}

/**
 * Helper: tokens por curso
 */
function getTokensByCourse(partner, environment, course, version) {
  return Object.values(db.get("students").value())
    .filter(s =>
      s.partner === partner &&
      s.environment === environment &&
      s.courses.includes(course) &&
      (!version || s.version === version)
    )
    .map(s => s.token);
}

/**
 * Geração de tópico
 */
function buildTopic(partner, environment) {
  return `${partner}-${environment}`;
}

/**
 * ROTA POST /push
 */
app.post("/push", async (req, res) => {
  try {
    const { partner, environment, title, message, student, course, version } = req.body;

    if (!partner || !environment || !title || !message) {
      return res.status(400).json({ error: "Campos obrigatórios: partner, environment, title, message" });
    }

    const firebaseApp = getFirebaseApp(partner);
    const messaging = getMessaging(firebaseApp);

    // -----------------------------------
    // REGRA 1 → estudante individual
    // -----------------------------------
    if (student) {
      const studentData = db.get("students").get(student).value();
      if (!studentData)
        return res.status(404).json({ error: `Estudante ${student} não encontrado.` });

      if (version && studentData.version !== version) {
        return res.status(400).json({ error: `Estudante ${student} não possui a versão ${version}.` });
      }

      const payload = {
        token: studentData.token,
        notification: { title, body: message },
        data: { partner, environment, student, course: course ?? "", version: studentData.version }
      };

      const response = await messaging.send(payload);
      return res.json({ success: true, type: "individual", sent_to: student, token: studentData.token, response });
    }

    // -----------------------------------
    // REGRA 2 → curso
    // -----------------------------------
    if (course) {
      const tokens = getTokensByCourse(partner, environment, course, version);
      if (tokens.length === 0)
        return res.status(404).json({ error: "Nenhum estudante encontrado para este curso/versão." });

      const payload = {
        tokens,
        notification: { title, body: message },
        data: { partner, environment, course, version: version ?? "" }
      };

      const response = await messaging.sendEachForMulticast(payload);
      return res.json({ success: true, type: "course", course, quantity: tokens.length, response });
    }

    // -----------------------------------
    // REGRA 3 → versão específica
    // -----------------------------------
    if (version) {
      const tokens = Object.values(db.get("students").value())
        .filter(s => s.partner === partner && s.environment === environment && s.version === version)
        .map(s => s.token);

      if (tokens.length === 0)
        return res.status(404).json({ error: "Nenhum estudante encontrado para essa versão." });

      const payload = {
        tokens,
        notification: { title, body: message },
        data: { partner, environment, version }
      };

      const response = await messaging.sendEachForMulticast(payload);
      return res.json({ success: true, type: "specific-version", quantity: tokens.length, response });
    }

    // -----------------------------------
    // REGRA 4 → mensagem por tópico
    // -----------------------------------
    const topic = buildTopic(partner, environment);

    const payload = {
      topic,
      notification: { title, body: message },
      data: { partner, environment }
    };

    const response = await messaging.send(payload);

    return res.json({ success: true, type: "general-topic", sent_to: topic, response });

  } catch (error) {
    console.error("Erro ao enviar push:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/token
 * Atualiza token + partner + environment + version
 */
app.post("/api/token", (req, res) => {
  try {
    const { studentId, token, partner, environment, version } = req.body;

    if (!studentId || !token || !partner || !environment || !version) {
      return res.status(400).json({
        error: "Campos obrigatórios: studentId, token, partner, environment, version"
      });
    }

    const studentExists = db.get("students").has(studentId).value();

    if (!studentExists) {
      return res.status(404).json({ error: `Estudante ${studentId} não encontrado.` });
    }

    // Atualiza os dados
    db.get("students")
      .set(`${studentId}.token`, token)
      .set(`${studentId}.partner`, partner)
      .set(`${studentId}.environment`, environment)
      .set(`${studentId}.version`, version)
      .set(`${studentId}.updatedAt`, new Date().toISOString())
      .write();

    const updated = db.get("students").get(studentId).value();

    return res.status(200).json({ success: true, student: updated });
  } catch (err) {
    console.error("Erro ao atualizar token:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * Servidor
 */
app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
