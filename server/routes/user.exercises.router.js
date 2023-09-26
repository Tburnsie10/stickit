const express = require('express');
const pool = require('../modules/pool');

const router = express.Router();

// updates EXERCISES in the user_session_exercises table
router.put('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { completedTempo, exerciseId, exerciseNotes } = req.body; // get this from body
  console.log(exerciseNotes);
  let userSessionExercises = `UPDATE user_session_exercises
     SET "completed_at" = NOW(),
      "completed_tempo" = $1,
      "completed" = true,
      "exercise_notes" = $5
     WHERE session_id = $2 AND user_id = $3 AND exercise_id = $4;`;
  pool
    .query(userSessionExercises, [
      completedTempo,
      sessionId,
      req.user.id,
      exerciseId,
      exerciseNotes,
    ])
    .then((result) => {
      res.sendStatus(200);
    })
    .catch((error) => {
      console.log('Error with get exercises request:', error);
      res.sendStatus(500);
    });
});

router.put('refresh/:sessionId', async (req, res) => {
  // we need the session id, exercise id, order, type, and focuses
  const { sessionId } = req.params;
  const { exerciseId, exercise_order, type_id, focus_id } = req.body; // get this from body
  try {
    // start transaction
    await pool.query('BEGIN');

    // check if the current exists and user is allowed to access it
    const currentUserSessionExerciseQuery = `SELECT * FROM user_session_exercises WHERE session_id = $1 AND user_id = $2 AND exercise_id = $3;`;
    const currentUserSessionExercise = await pool.query(
      currentUserSessionExerciseQuery,
      [sessionId, req.user.id, exerciseId]
    );

    if (currentUserSessionExercise.rows.length === 0) {
      res.status(403).send({
        message: 'You are not authorized to update this exercise',
        status: 403,
      });
    }

    // Find a random exercise that has the same type and focuses that will replace previous exercise and is not the same as the previous exercise
    const nexExerciseQuery = `SELECT * FROM exercises WHERE type_id = $1 AND focus_id = $2 AND id != $3 ORDER BY RANDOM() LIMIT 1;`;
    const newExerciseResult = await pool.query(nexExerciseQuery, [
      type_id,
      focus_id,
      exerciseId,
    ]);

    // if no exercise is found, throw an error
    if (newExerciseResult.rows.length === 0) {
      throw new Error(
        'The server was unable to get exercises from the database with the parameters provided, please check that the database connection is working and that there are an appropriate amount of exercises in the database for the types and focuses chosen'
      );
    }

    // new exercise
    const newExercise = newExerciseResult.rows[0];

    // locate the current exercise that needs to be refreshed and remove it from the session
    const deleteExerciseQuery = `DELETE FROM user_session_exercises WHERE session_id = $1 AND user_id = $2 AND exercise_id = $3;`;
    await pool.query(deleteExerciseQuery, [sessionId, req.user.id, exerciseId]);

    //  add the new exercise to the session, replacing the old one and update the order
    const addExerciseQuery = `INSERT INTO user_session_exercises (session_id, user_id, exercise_id, exercise_order) VALUES ($1, $2, $3, $4);`;
    await pool.query(addExerciseQuery, [
      sessionId,
      req.user.id,
      newExercise.id,
      exercise_order,
    ]);

    // send new exercise to client with the exercise order
    res.status(201).send({ ...newExercise, exercise_order });

    // end transaction
    await pool.query('COMMIT');
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: `Error updating exercise: ${error}`,
      statusCode: 500,
    });
    await pool.query('ROLLBACK');
  }
});

module.exports = router;
