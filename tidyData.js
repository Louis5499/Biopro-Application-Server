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

const forms = [];

async function main() {
  let snapshot = await userRef.once('value');
  const userData = snapshot.val();

  snapshot = await recommRef.once('value');
  const recommData = snapshot.val();

  snapshot = await topicRef.once('value');
  const topicData = snapshot.val();

  for (const userKey in userData) {
    const fetchedForms = userData[userKey].forms;
    if(!fetchedForms) continue;
    for (const perFormKey in fetchedForms) {
      const fetchedForm = fetchedForms[perFormKey];
      if (fetchedForm.isTest) continue;
      for (const perRecommKey in fetchedForm.recommPeople) {
        const fetchedRecomm = fetchedForm.recommPeople[perRecommKey];
        const { recommRepoHash = null } = fetchedRecomm;

        let hasCompleteRecomm = false;
        let optionalData = {};
        if (recommRepoHash !== null) {
          const filteredRecommData = recommData[recommRepoHash];
          if (filteredRecommData) {
            const { recmndText = null, recmndFileUrl = null } = filteredRecommData;
            if (recmndText || recmndFileUrl) hasCompleteRecomm = true;
            optionalData = { referee_name: fetchedRecomm.name, referee_email: fetchedRecomm.email, recmndText, recmndFileUrl };
          }
        } else {
          optionalData = { referee_name: fetchedRecomm.name, referee_email: fetchedRecomm.email };
        }

        if (fetchedForms[perFormKey].classHistories) delete fetchedForms[perFormKey].classHistories;
        if (fetchedForms[perFormKey].langAbilities) delete fetchedForms[perFormKey].langAbilities;
        let topicName = '';
        if (topicData[fetchedForm.topicIndex]) {
          topicName = topicData[fetchedForm.topicIndex];
        }

        forms.push({ ...fetchedForms[perFormKey], ...optionalData, topicName, hasCompleteRecomm });
      }
    }
  }

  let stream = '';
  const fileName = 'test.csv';
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

