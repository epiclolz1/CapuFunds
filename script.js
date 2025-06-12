// --- 1. Firebase Configuration ---
// PASTE YOUR FIREBASE CONFIG OBJECT HERE
const firebaseConfig = {
  apiKey: "AIzaSyD-6UiwuoZORnm7P965pP0QxksxcWrNn04",
  authDomain: "capufunds.firebaseapp.com",
  projectId: "capufunds",
  storageBucket: "capufunds.firebasestorage.app",
  messagingSenderId: "221516557110",
  appId: "1:221516557110:web:8159ec978d77c9d834e197",
  measurementId: "G-X88X4FV5Z7"
};

// --- 2. Initialize Firebase ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- 3. Get DOM Elements ---
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginUsernameInput = document.getElementById('login-username');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginButton = document.getElementById('login-button');
const toggleText = document.querySelector('.toggle-text');
const userNameDisplay = document.getElementById('user-name');
const userBalanceDisplay = document.getElementById('user-balance');
const logoutButton = document.getElementById('logout-button');
const redeemCodeInput = document.getElementById('redeem-code-input');
const redeemCodeButton = document.getElementById('redeem-code-button');
const redeemMessage = document.getElementById('redeem-message');
const statsTab = document.getElementById('stats-tab');
const leaderboardTab = document.getElementById('leaderboard-tab');
const statsView = document.getElementById('stats-view');
const leaderboardView = document.getElementById('leaderboard-view');
const leaderboardList = document.getElementById('leaderboard-list');

// --- 4. App State ---
let isSignUp = false;

// --- 5. Authentication Logic ---
// Set initial state for the username input to be hidden for login
loginUsernameInput.style.display = 'none';
// **FIX:** Make username not required on initial load (login mode)
loginUsernameInput.required = false;

// CORRECTED: Use Event Delegation on the form
loginForm.addEventListener('click', (e) => {
    // Check if the clicked element is the toggle link
    if (e.target.id === 'toggle-signup') {
        e.preventDefault(); // Prevent the link from adding a '#' to the URL
        isSignUp = !isSignUp;
        
        loginUsernameInput.style.display = isSignUp ? 'block' : 'none';
        // **FIX:** Toggle the 'required' property based on mode
        loginUsernameInput.required = isSignUp; 

        loginButton.textContent = isSignUp ? 'Sign Up' : 'Log In';
        toggleText.innerHTML = isSignUp 
            ? 'Already have an account? <a href="#" id="toggle-signup">Log in</a>'
            : 'Don\'t have an account? <a href="#" id="toggle-signup">Sign up</a>';
    }
});

// Handle form submission for both login and signup
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    const username = loginUsernameInput.value;

    if (isSignUp) {
        // --- Sign Up ---
        // The 'required' attribute handles the check now, but this is a good backup.
        if (!username) { 
            alert('Please enter a username');
            return;
        }
        auth.createUserWithEmailAndPassword(email, password)
            .then(userCredential => {
                const user = userCredential.user;
                return db.collection('users').doc(user.uid).set({
                    username: username,
                    balance: 0
					isAdmin: false
					isManager: false
					isMod: false
                });
            })
            .catch(error => {
                alert(error.message);
                console.error("Signup Error:", error);
            });
    } else {
        // --- Log In ---
        auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                alert(error.message);
                console.error("Login Error:", error);
            });
    }
});

// Logout
logoutButton.addEventListener('click', () => {
    auth.signOut();
});

// --- 6. Auth State Observer ---
auth.onAuthStateChanged(user => {
    if (user) {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        const userDocRef = db.collection('users').doc(user.uid);
        
        userDocRef.onSnapshot(doc => {
            if (doc.exists) {
                const userData = doc.data();
                userNameDisplay.textContent = userData.username;
                userBalanceDisplay.textContent = userData.balance;
            } else {
                console.log("No such user document! This can happen if the db write failed after signup.");
            }
        }, error => {
            console.log("Error getting user document:", error);
        });

    } else {
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});

// --- 7. App Functionality ---
redeemCodeButton.addEventListener('click', () => {
    const codeId = redeemCodeInput.value.trim().toUpperCase();
    if (!codeId) {
        redeemMessage.textContent = 'Please enter a code.';
        return;
    }
    redeemMessage.textContent = 'Processing...';

    const user = auth.currentUser;
    if (!user) return;

    // Get references to the documents we need to work with.
    const userRef = db.collection('users').doc(user.uid);
    const codeRef = db.collection('codes').doc(codeId);

    // Run the redeem logic as a secure Firestore transaction.
    db.runTransaction(async (transaction) => {
        // Inside a transaction, you do all your READS first.
        const codeDoc = await transaction.get(codeRef);
        const userDoc = await transaction.get(userRef);

        // --- VALIDATION ---
        // Stop if the code doesn't exist.
        if (!codeDoc.exists) {
            throw "Invalid code!"; // This message will be sent to the .catch() block
        }
        // Stop if the code has already been used.
        if (codeDoc.data().used) {
            throw "This code has already been used.";
        }
        // Stop if for some reason the user document doesn't exist.
        if (!userDoc.exists) {
            throw "Could not find your user data.";
        }

        // --- CALCULATION ---
        const codeValue = codeDoc.data().value;
        const newBalance = userDoc.data().balance + codeValue;

        // --- WRITES ---
        // After all reads, you perform your writes.
        // The security rules will now validate these changes.
        transaction.update(userRef, { balance: newBalance });
        transaction.update(codeRef, {
            used: true,
            redeemedBy: user.uid,
            redeemedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // The transaction will automatically return the successful value.
        return `Successfully redeemed ${codeValue}!`;

    }).then((successMessage) => {
        // This block runs if the transaction was successful.
        redeemMessage.textContent = successMessage;
        redeemCodeInput.value = '';
    }).catch((error) => {
        // This block runs if the transaction failed, or if we "threw" an error.
        // If the rules deny it, the error will be "Missing or insufficient permissions."
        // If our checks fail, it will be our custom message.
        console.error("Redeem transaction failed: ", error);
        redeemMessage.textContent = error.toString();
    });
});

// --- 8. Tabs and Leaderboard ---
statsTab.addEventListener('click', () => {
    statsView.classList.remove('hidden');
    leaderboardView.classList.add('hidden');
    statsTab.classList.add('active');
    leaderboardTab.classList.remove('active');
});

leaderboardTab.addEventListener('click', () => {
    statsView.classList.add('hidden');
    leaderboardView.classList.remove('hidden');
    statsTab.classList.remove('active');
    leaderboardTab.classList.add('active');
    fetchLeaderboard();
});

function fetchLeaderboard() {
    leaderboardList.innerHTML = 'Loading...';
    db.collection('users').orderBy('balance', 'desc').limit(10).get()
    .then(querySnapshot => {
        leaderboardList.innerHTML = '';
        let rank = 1;
        querySnapshot.forEach(doc => {
            const user = doc.data();
            const entry = document.createElement('div');
            entry.classList.add('leaderboard-entry');
            entry.innerHTML = `<span class="rank">#${rank}</span><span class="name">${user.username}</span><span class="balance">${user.balance}</span>`;
            leaderboardList.appendChild(entry);
            rank++;
        });
    }).catch(error => {
        console.error("Error getting leaderboard: ", error);
        leaderboardList.innerHTML = 'Error loading leaderboard.';
    });
}
