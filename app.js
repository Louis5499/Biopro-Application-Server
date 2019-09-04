/**
 * Copyright 2017, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// [START gae_node_request_example]
const express = require('express');
const app = express();
const bodyParser = require('body-parser');

// firebase
const admin = require('firebase-admin');
const serviceAccount = require("./nthu-a-plus-2019-firebase-adminsdk-0efmt-0a3066b278.json");
const cors = require('cors');

// Library
const crypto = require('crypto');
const shasum = crypto.createHash('sha1');
const nodemailer = require('nodemailer');
app.use(bodyParser.json()); // for parsing application/json
app.use(cors());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://nthu-a-plus-2019.firebaseio.com"
});


const db = admin.database();
const ref = db.ref('users');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'biopro.aplus@gmail.com',
    pass: 'nelab104'
  }
});

var getSHA1ofJSON = function(input){
  return crypto.createHash('sha1').update(input).digest('hex')
}

const topicProcess = (newFormSnapshot) => {
   // 1. topic process
   const topicIndexFieldSnapshot = newFormSnapshot.child('topicIndex');
   if (!topicIndexFieldSnapshot.exists()) {
     console.log('No topicIndex Field')
     return;
   }
 
   const topicIndexStr = topicIndexFieldSnapshot.val();
   const formId = newFormSnapshot.key;
   const userId = newFormSnapshot.ref.parent.parent.key;
   const entryKey = getSHA1ofJSON(`${formId}${userId}`);
 
   const rootRef = newFormSnapshot.ref.root;
   rootRef.child('topics').child(topicIndexStr).child(entryKey).child('formId').set(formId);
   rootRef.child('topics').child(topicIndexStr).child(entryKey).child('userId').set(userId);
};

const recommendProcess = (newFormSnapshot) => {
  const recmndsFieldSnapshot = newFormSnapshot.child('recommPeople');
  if (!(newFormSnapshot.hasChild('engName') && newFormSnapshot.hasChild('chiName') && newFormSnapshot.hasChild('topicIndex'))) {
    // console.log('Insufficient data.');
    // console.log(newFormSnapshot.val(), newFormSnapshot.hasChild('engName'), newFormSnapshot.hasChild('chiName'), newFormSnapshot.hasChild('topicIndex'));
    return;
  }

  const applierName = newFormSnapshot.child('engName').val();
  const applierEmail = newFormSnapshot.child('email').val();
  const applierTopicIndex = newFormSnapshot.child('re').val();

  recmndsFieldSnapshot.forEach(async function (recmndItem) {
    if (recmndItem.hasChild('email') && recmndItem.hasChild('name')) {
      const recmndItemRef = recmndItem.ref;
      const refereeEmail = recmndItem.child('email').val();
      const refereeName = recmndItem.child('name').val();
      const recmndRepoHash = getSHA1ofJSON(`${refereeEmail}${newFormSnapshot.key}`);

      const recmndRepoRef = db.ref('recomms');
      const recmndRepoItemRef = recmndRepoRef.child(recmndRepoHash)
      const recmndRepoItem = await recmndRepoItemRef.once('value');
      if (recmndRepoItem.hasChild('email') || recmndRepoItem.hasChild('done')) {
        return;
      }

      recmndRepoItemRef.child('refereeEmail').set(refereeEmail);
      recmndRepoItemRef.child('email').set(applierEmail);
      recmndRepoItemRef.child('name').set(applierName);
      recmndRepoItemRef.child('re').set(applierTopicIndex);

      console.log("New recommendation request added. \nHash: %s, \nApplier: %s, \nReferee: %s", recmndRepoHash, applierEmail, refereeEmail);

      transporter.sendMail({
        from: 'noreply@mail.nthuaplus.org',
        to: refereeEmail,
        subject: 'New recommendation via biopro plan',
        text: `This is the notification from biopro a plus.\n
        ${applierName} has invited you to write the recommendation for biopro a plus plan. \n
        Please REGISTER an account with email=${refereeEmail} and sigin in biopro application page to finish the recommendation.\n
        Application page: https://application.bioproaplus.org/\n
        If there has any question, please email biopro.aplus@gmail.com right away. Thanks.`
      } , function(error, info) {
        if (error) console.log(error);
        else console.log('Email sent: ' + info.response);
      });

      recmndItemRef.child('recommRepoHash').set(recmndRepoHash);
    }
  });
};

ref.on('child_added', function(newUser, prevChildKey) {
  newUser.ref.child('forms').on('child_added', function(newFormSnapshot, prevChildKey) {
    topicProcess(newFormSnapshot);
    recommendProcess(newFormSnapshot);
  });
});


const recmmdRef = db.ref('recomms');

recmmdRef.on('value', function(recmndRepoItem) {
  const repoItemHash = recmndRepoItem.key;

  if (recmndRepoItem.hasChild('done') && recmndRepoItem.hasChild('refereeEmail')) {
    const doneFlag = recmndRepoItem.child('done');

    if (doneFlag) {
      if (recmndRepoItem.hasChild('notified')) {
        const notifiedFlag = recmndRepoItem.child('notified');
        if (notifiedFlag) return;
      }

      const refereeEmail = recmndRepoItem.child('refereeEmail').val();
      if (refereeEmail === null) {
        console.log('Referee email null in recommendation repo item');
        return;
      }

      console.log('Recommendation complete. Hash: %s\nReferee Email: %s', repoItemHash, refereeEmail);

      transporter.sendMail({
        from: 'noreply@mail.nthuaplus.org',
        to: refereeEmail,
        subject: 'New recommendation via biopro plan',
        text: "2ca44d76-9fea-4d7d-b09a-fb7b86b8f3a9"
      } , function(error, info) {
        if (error) console.log(error);
        else console.log('Email sent: ' + info.response);
      });

      recmndRepoItem.child('notified').set(true);
    }
  }
});

app.get('/', (req, res) => {
  res
    .status(200)
    .send('Hello, world!')
    .end();
});

app.post('/loginReviewSystem', async (req, res) => {
  const { email, password } = req.body;

  const reviewSystemRef = db.ref('reviewUsers');
  let snapshot = await reviewSystemRef.once('value');
  const reviewUsers = snapshot.val();

  const topicRef = db.ref('miscs/topics');
  snapshot = await topicRef.once('value');
  const topicData = snapshot.val();

  let is_correct = false;
  let topic_index = null;
  let topic_name = '';
  for (const perUserKey in reviewUsers) {
    const reviewUser = reviewUsers[perUserKey];
    if (reviewUser.email === email && reviewUser.password === password) {
      is_correct = true;
      topic_index = reviewUser.topicIndex;
      topic_name = topicData[topic_index];
      break;
    }
  }
  res.json({ is_correct, topic_index, topic_name });
});

app.post('/giveScore', async (req, res) => {
  const { form_key, user_key, score_list } = req.body;

  await ref.child(user_key).child('forms').child(form_key).child('reviewScore').set(score_list);
  await ref.child(user_key).child('forms').child(form_key).child('reviewFinished').set(true);

  res.json({ is_success: true });
});

// Start the server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
// [END gae_node_request_example]

module.exports = app;
