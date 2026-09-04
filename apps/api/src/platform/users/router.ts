import { Router } from 'express';
import { requireScopes } from '../auth/scopes.js';
import { listDirectoryUsers } from './directory.service.js';

// `GET /users` — imenik za izbiro osebe.
//
// ZAKAJ JE TA POT V platform/ IN NE V modules/todos/ (člen I, research.md §11):
//
//  - Člen I postavlja preizkus: odstranitev zavihka mora biti izbris ene mape in enega vnosa v
//    registru. Če bi izbirnik živel na `GET /todos/users`, bi ga drugi modul, ki potrebuje
//    izbiro osebe, moral podvojiti ali uvoziti iz `modules/todos` (kar je ESLint napaka),
//    izbris mape `todos` pa bi pobral splošen endpoint.
//  - Imenik uporabnikov ni pojem opravil. `GET /todos/users` je laž v naslovu in bi
//    avtomatizacijo silil vedeti, da "uporabniki živijo pod opravili".
//
// Precedens: platform/tabs/router.ts (`/tabs`), platform/notifications/router.ts (`/devices`),
// platform/apikeys/router.ts — vsi so vpeti z eno vrstico v main.ts.
//
// Obseg je `requireScopes()` (katerikoli avtenticiran klicatelj) in NE `todos:*`: slednje bi
// imenik povleklo nazaj v to, da je pojem opravil (FR-075).

export const usersRouter = Router();

usersRouter.get('/users', requireScopes(), async (req, res, next) => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    // Privzeto `true`: v izbirniku za deljenje sebe ni smiselno ponujati, in lastnika tako ali
    // tako ni mogoče dodati med soudeležence (FR-048).
    const excludeSelf = req.query.excludeSelf !== 'false';

    // Za klicatelja z API ključem `subjectId` ni uporabnik, zato ni koga izpustiti — isti
    // dogovor kot pri `resolveTabs` in `readServerTranscriptionConsent`.
    const selfId = req.auth?.subjectType === 'user' ? req.auth.subjectId : undefined;

    const users = await listDirectoryUsers({
      excludeUserId: excludeSelf ? selfId : undefined,
      query,
    });

    res.json({ users });
  } catch (err) {
    next(err);
  }
});
