import { db } from "../src/lib/db";
import { deliverNotifications } from "../src/lib/notifications";
deliverNotifications().then(result => console.log(JSON.stringify(result))).catch(() => { console.error("Notification delivery failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
