/** 產生統整 csv 資料 */

'use strict';

const express = require('express');
// const json2csv = require('json2csv').parse;
const iconv = require('iconv-lite');
const fs = require('fs');

const app = express();

const admin = require('firebase-admin');
const serviceAccount = require("./nthu-a-plus-2019-firebase-adminsdk-0efmt-0a3066b278.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://nthu-a-plus-2019.firebaseio.com"
});


const db = admin.database();
const userRef = db.ref('users');
const recommRef = db.ref('recomms');
const topicRef = db.ref('miscs/topics');
const topicIndexRef = db.ref('topics');

const forms = [];

async function main() {
  let snapshot = await userRef.once('value');
  const userData = snapshot.val();

  snapshot = await recommRef.once('value');
  const recommData = snapshot.val();

  snapshot = await topicRef.once('value');
  const topicData = snapshot.val();

  snapshot = await topicIndexRef.once('value');
  const topicIndexRefData = snapshot.val();

  for (const userKey in userData) {
    const fetchedForms = userData[userKey].forms;
    if(!fetchedForms) continue;
    for (const perFormKey in fetchedForms) {
      const fetchedForm = fetchedForms[perFormKey];
      let topicName = '';
      if (fetchedForm.isTest) continue;
      
      const belongsTo = topicIndexRefData[fetchedForm.topicIndex];
      let hasBelong = false;
      for (const perInnerKey in belongsTo) {
        if (belongsTo[perInnerKey].formId === perFormKey) {
          hasBelong = true;
        }
      }
      if (!hasBelong) continue;

      if (topicData[fetchedForm.topicIndex]) {
        topicName = topicData[fetchedForm.topicIndex];
      }

      if (!fetchedForm.reviewScore) {
        console.log(`id: ${userKey} .user: ${fetchedForm.chiName}. topicName: ${topicName} has not completed!`);
        continue;
      }
      let cnt = 0;

      for (const perReviewScoreKey in fetchedForm.reviewScore) {
        const perReview = fetchedForm.reviewScore[perReviewScoreKey];
        if (perReview.issuerEmail.includes('test')) {
          continue;
        }

        let avg = 0;
        for (const perScoreKey in perReview) {
          if (perScoreKey === 'issuerEmail' || perScoreKey === 'otherComments') continue;
          avg += Number(perReview[perScoreKey]);
        }
        avg /= 8;

        forms.push({ ...fetchedForms[perFormKey], ...perReview, avg, topicName })
        cnt++;
      }
      if (cnt <= 0) {
        console.log(`[No] id: ${userKey} .user: ${fetchedForm.chiName}. topicName: ${topicName} has not completed!`);
      }
      cnt = 0;
    }
  }

  let stream = '';
  const fileName = 'score.csv';
  const dataKeys = Object.keys(forms[0]);
  for (const key of dataKeys) { stream += key + ',' }
  stream = stream.slice(0, stream.length - 1);
  stream += '\n';

  for (const perData of forms) {
    for (const perKey of dataKeys) {
      if (perData[perKey]) {
        stream += `"${perData[perKey]}",`;
      } else {
        stream += ',';
      }
    }
    stream = stream.slice(0, stream.length - 1);
    stream += '\n';
  }

  fs.writeFile(fileName, '\ufeff' + stream, function(err) { if(err) throw err; });
};

main().catch(error => { console.log(error) });

