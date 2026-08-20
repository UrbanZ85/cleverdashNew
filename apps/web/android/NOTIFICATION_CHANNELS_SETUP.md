# Registracija kanalov za obvestila (FR-032)

`res/values/notification_channels.xml` v tej mapi hrani ID-je in besedila kanalov, ne
ustvari pa jih — Android od API 26 dalje zahteva klic
`NotificationManager.createNotificationChannel(...)` v izvorni kodi. Ta korak se **ne** da
opraviti pred `npx cap add android` (glej `specs/001-app-shell-dashboard/quickstart.md`
§6), ker do takrat `MainActivity` ne obstaja.

## Ko `npx cap add android` ustvari projekt

V `MainActivity.java` (ali `.kt`, odvisno od predloge Capacitorja) dodaj v `onCreate`,
**pred** `super.onCreate(...)` klicem `PushNotifications` vtičnika:

```java
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

private void createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return; // kanali obstajajo od API 26

    NotificationManager manager = getSystemService(NotificationManager.class);

    NotificationChannel system = new NotificationChannel(
        getString(R.string.notification_channel_system_id),
        getString(R.string.notification_channel_system_name),
        NotificationManager.IMPORTANCE_DEFAULT
    );
    system.setDescription(getString(R.string.notification_channel_system_description));
    manager.createNotificationChannel(system);

    NotificationChannel reminders = new NotificationChannel(
        getString(R.string.notification_channel_reminders_id),
        getString(R.string.notification_channel_reminders_name),
        NotificationManager.IMPORTANCE_DEFAULT
    );
    reminders.setDescription(getString(R.string.notification_channel_reminders_description));
    manager.createNotificationChannel(reminders);
}
```

Pokliči `createNotificationChannels()` v `onCreate` pred registracijo vtičnikov. Kanala
morata obstajati, preden prispe prvo obvestilo — sicer Android uporabi privzet kanal, ki ga
ni mogoče ločeno izklopiti (natanko to FR-032 prepove).

## Kje strežnik izbere kanal

`apps/api/src/platform/notifications/channels.ts` (`NOTIFICATION_CHANNELS.SYSTEM` /
`.REMINDERS`) — ista ID-ja kot zgoraj. Sprememba ID-ja na eni strani brez druge tiho podre
usmerjanje obvestil v pravi kanal.
