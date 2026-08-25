import nodemailer from 'nodemailer';

async function diagnosticarSMTP() {
  const user = process.env.OUTLOOK_USER;
  const pass = process.env.OUTLOOK_APP_PASSWORD;

  if (!user || !pass) {
    console.error("❌ Faltan las variables OUTLOOK_USER o OUTLOOK_APP_PASSWORD en tu entorno.");
    return;
  }

  console.log(`1. Configurando transporte SMTP para: ${user} and ${pass}`);
  
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", // ⬅️ Cambio crucial
    port: 587,
    secure: false,
    auth: { user, pass }
  });

  try {
    console.log("2. Estableciendo apretón de manos (handshake) con Microsoft...");
    await transporter.verify();
    console.log("✅ AUTENTICACIÓN EXITOSA. La contraseña de aplicación es válida.");

    console.log("3. Despachando correo de prueba...");
    const info = await transporter.sendMail({
      from: user,
      to: user, // Te lo envías a ti mismo para validar recepción
      subject: "🧪 Prueba de Integración SMTP - MetroSoft",
      text: "Si estás leyendo esto, la configuración de Nodemailer funciona a la perfección."
    });

    console.log(`🎉 ¡CORREO ENVIADO! ID del mensaje: ${info.messageId}`);
    console.log("🎯 VEREDICTO: Tienes luz verde para aplicar el código de producción en el worker.");
  } catch (error: any) {
    console.error("\n❌ ERROR DE AUTENTICACIÓN SMTP:");
    console.error(error.message);
    console.log("\n🎯 VEREDICTO: La conexión fue rechazada. Revisa que tu contraseña de 16 caracteres no tenga espacios y el correo esté bien escrito.");
  }
}

diagnosticarSMTP();