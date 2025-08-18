#!/usr/bin/env python3
"""
Core Backend Functionality Test - Focus on critical functionality
"""

import requests
import json
import time
from datetime import datetime

BACKEND_URL = "https://kaleidoscope-gen.preview.emergentagent.com/api"

def test_core_functionality():
    """Test core backend functionality that affects frontend operations"""
    print("=" * 50)
    print("CORE BACKEND FUNCTIONALITY TEST")
    print("=" * 50)
    
    session = requests.Session()
    session.timeout = 10
    
    tests_passed = 0
    total_tests = 0
    
    # Test 1: Basic connectivity
    total_tests += 1
    try:
        response = session.get(f"{BACKEND_URL}/")
        if response.status_code == 200 and response.json().get("message") == "Hello World":
            print("✅ Backend Connectivity: WORKING")
            tests_passed += 1
        else:
            print(f"❌ Backend Connectivity: FAILED - {response.status_code}")
    except Exception as e:
        print(f"❌ Backend Connectivity: FAILED - {str(e)}")
    
    # Test 2: Database operations
    total_tests += 1
    try:
        # Create test data
        test_data = {"client_name": f"CoreTest_{int(time.time())}"}
        post_response = session.post(f"{BACKEND_URL}/status", json=test_data)
        
        if post_response.status_code == 200:
            # Verify data was created
            get_response = session.get(f"{BACKEND_URL}/status")
            if get_response.status_code == 200:
                records = get_response.json()
                if any(r.get('client_name') == test_data['client_name'] for r in records):
                    print("✅ Database Operations: WORKING")
                    tests_passed += 1
                else:
                    print("❌ Database Operations: FAILED - Data not persisted")
            else:
                print("❌ Database Operations: FAILED - Cannot retrieve data")
        else:
            print(f"❌ Database Operations: FAILED - Cannot create data: {post_response.status_code}")
    except Exception as e:
        print(f"❌ Database Operations: FAILED - {str(e)}")
    
    # Test 3: API Response format
    total_tests += 1
    try:
        response = session.get(f"{BACKEND_URL}/status")
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                print("✅ API Response Format: WORKING")
                tests_passed += 1
            else:
                print("❌ API Response Format: FAILED - Invalid format")
        else:
            print(f"❌ API Response Format: FAILED - {response.status_code}")
    except Exception as e:
        print(f"❌ API Response Format: FAILED - {str(e)}")
    
    # Test 4: Error handling
    total_tests += 1
    try:
        response = session.post(f"{BACKEND_URL}/status", data="invalid")
        if response.status_code in [400, 422]:
            print("✅ Error Handling: WORKING")
            tests_passed += 1
        else:
            print(f"❌ Error Handling: FAILED - Expected 400/422, got {response.status_code}")
    except Exception as e:
        print(f"❌ Error Handling: FAILED - {str(e)}")
    
    print("-" * 50)
    print(f"CORE BACKEND TEST RESULTS: {tests_passed}/{total_tests} passed")
    
    if tests_passed == total_tests:
        print("🎉 BACKEND IS STABLE AND READY FOR FRONTEND OPERATIONS")
        return True
    else:
        print("⚠️ BACKEND HAS ISSUES THAT MAY AFFECT FRONTEND")
        return False

if __name__ == "__main__":
    success = test_core_functionality()
    exit(0 if success else 1)