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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// --- 2. Initialize Firebase ---
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- 3. Get DOM Elements ---
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');

// Login Form
const loginForm = document.getElementById('login-form');
const loginUsernameInput = document.getElementById('login-username');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginButton = document.getElementById('login-button');
const toggleSignupLink = document.getElementById('toggle-signup');
const toggleText = document.querySelector('.toggle-text');

// App Elements
const userNameDisplay = document.getElementById('user-name');
const userBalanceDisplay = document.getElementById('user-balance');
const logoutButton = document.getElementById('logout-button');

// Redeem Code
const redeemCodeInput = document.getElementById('redeem-code-input');
const redeemCodeButton = document.getElementById('redeem-code-button');
const redeemMessage = document.getElementById('redeem-message');

// Tabs
const statsTab = document.getElementById('stats-tab');
const leaderboardTab = document.getElementById('leaderboard-tab');
const statsView = document.getElementById('stats-view');
const leaderboardView = document.getElementById('leaderboard-view');
const leaderboardList = document.getElementById('leaderboard-list');


// --- 4. App State ---
let isSignUp = false;

// --- 5. Authentication Logic ---

// Toggle between Login and Sign Up mode
toggleSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    
    loginUsernameInput.style.display = isSignUp ? 'block' : 'none';
    loginButton.textContent = isSignUp ? 'Sign Up' : 'Log In';
    toggleText.innerHTML = isSignUp 
        ? 'Already have an account? <a href="#" id="toggle-signup">Log in</a>'
        : 'Don\'t have an account? <a href="#" id="toggle-signup">Sign up</a>';

    // Re-add event listener to the new link
    document.getElementById('toggle-signup').addEventListener('click', arguments.callee);
});

// Handle form submission for both login and signup
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    const username = loginUsernameInput.value;

    if (isSignUp) {
        // --- Sign Up ---
        if (!username) {
            alert('Please enter a username');
            return;
        }
        auth.createUserWithEmailAndPassword(email, password)
            .then(userCredential => {
                // After signup, create a user document in Firestore
                const user = userCredential.user;
                db.collection('users').doc(user.uid).set({
                    username: username,
                    balance: 0 // Start with 0 balance
                }).then(() => {
                    console.log('User profile created in Firestore');
                }).catch(error => {
                    console.error("Error creating user document: ", error);
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
// This is the core function that runs when a user logs in or out
auth.onAuthStateChanged(user => {
    if (user) {
        // User is signed in
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        
        // Get user data from Firestore
        const userDocRef = db.collection('users').doc(user.uid);
        
        // Listen for realtime updates to the user's data
        userDocRef.onSnapshot(doc => {
            if (doc.exists) {
                const userData = doc.data();
                userNameDisplay.textContent = userData.username;
                userBalanceDisplay.textContent = userData.balance;
            } else {
                console.log("No such user document!");
            }
        }, error => {
            console.log("Error getting user document:", error);
        });

    } else {
        // User is signed out
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});


// --- 7. App Functionality ---

// Redeem Code
redeemCodeButton.addEventListener('click', () => {
    const code = redeemCodeInput.value.trim();
    if (!code) {
        redeemMessage.textContent = 'Please enter a code.';
        return;
    }
    redeemMessage.textContent = 'Redeeming...';

    const user = auth.currentUser;
    const codeRef = db.collection('codes').doc(code);
    const userRef = db.collection('users').doc(user.uid);

    // Use a transaction to make sure the redeem is atomic (all or nothing)
    db.runTransaction(transaction => {
        return transaction.get(codeRef).then(codeDoc => {
            if (!codeDoc.exists) {
                throw "Invalid code!";
            }
            if (codeDoc.data().used) {
                throw "This code has already been used.";
            }

            // If code is valid and unused, get the user's current balance
            return transaction.get(userRef).then(userDoc => {
                const codeValue = codeDoc.data().value;
                const newBalance = userDoc.data().balance + codeValue;

                // Update the user's balance and mark the code as used
                transaction.update(userRef, { balance: newBalance });
                transaction.update(codeRef, { used: true, redeemedBy: user.uid });
                
                return codeValue; // Return the value to show a success message
            });
        });
    }).then(redeemedValue => {
        redeemMessage.textContent = `Successfully redeemed ${redeemedValue}!`;
        redeemCodeInput.value = '';
    }).catch(error => {
        console.error("Redeem transaction failed: ", error);
        redeemMessage.textContent = error;
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
    fetchLeaderboard(); // Fetch the leaderboard data when tab is clicked
});

function fetchLeaderboard() {
    leaderboardList.innerHTML = 'Loading...'; // Show loading state
    
    db.collection('users').orderBy('balance', 'desc').limit(10).get()
    .then(querySnapshot => {
        leaderboardList.innerHTML = ''; // Clear loading/previous state
        let rank = 1;
        querySnapshot.forEach(doc => {
            const user = doc.data();
            const entry = document.createElement('div');
            entry.classList.add('leaderboard-entry');
            entry.innerHTML = `
                <span class="rank">#${rank}</span>
                <span class="name">${user.username}</span>
                <span class="balance">${user.balance}</span>
            `;
            leaderboardList.appendChild(entry);
            rank++;
        });
    }).catch(error => {
        console.error("Error getting leaderboard: ", error);
        leaderboardList.innerHTML = 'Error loading leaderboard.';
    });
}

// Set initial state for username input
loginUsernameInput.style.display = 'none';