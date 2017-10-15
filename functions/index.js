const functions = require('firebase-functions');
const _ = require('lodash');

// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

exports.likesNotification = functions.firestore.document('spots/{spotId}').onUpdate((event) => {


    var newValue = event.data.data();
    var previousValue = event.data.previous.data();

    const userUid = newValue.userUid;

    if(previousValue.likes !== newValue.likes){
        const userLikerUid = _.last(newValue.likes);
        if(!userLikerUid){
            return console.log("We don't have a new notification");
        }
        console.log('We have a new like UID:', userLikerUid, 'for user:', userUid);

        // Get the list of device notification tokens.
        var getDeviceTokensPromise = admin.firestore().doc(`/users/${userUid}`).get();

        // Get the liker profile.
        const getFollowerProfilePromise = admin.auth().getUser(userLikerUid);

        return Promise.all([getDeviceTokensPromise,getFollowerProfilePromise]).then(results => {

            const tokensSnapshot = results[0];
            const liker = results[1];

            const user = tokensSnapshot.data();

            console.log("Token "+ user.token);
            console.log('Fetched liker profile', liker);

            if (!user.token) {
                return console.log('There are no notification token to send to.');
              }
            // Notification details.
            const payload = {
                notification: {
                title: 'You have a new like!',
                body: `${liker.displayName} like your spot.`,
                sound: "default"
                },
                data:{
                    sendername: `${liker.displayName} like your spot.`,
                    message: "test"
                }
            };


            const tokens = [];
            tokens.push(user.token);
            // Send notifications to all tokens.
            return admin.messaging().sendToDevice(tokens, payload).then(response => {
              // For each message check if there was an error.
              const tokensToRemove = [];
              response.results.forEach((result, index) => {
                const error = result.error;
                if (error) {
                  console.error('Failure sending notification to', tokens[index], error);
                  // Cleanup the tokens who are not registered anymore.
                  if (error.code === 'messaging/invalid-registration-token' ||
                      error.code === 'messaging/registration-token-not-registered') {
                    tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                  }
                }else{
                    console.log("Notification sended");
                }
              });
              return Promise.all(tokensToRemove);
            });


        });
    }
    
});