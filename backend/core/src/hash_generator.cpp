#include "hash_generator.h"
#include <chrono>
#include <thread>
#include <mutex>
#include <cstring>

namespace urlshortener {

const std::string HashGenerator::BASE62_ALPHABET =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

uint64_t HashGenerator::sequence_ = 0;
uint64_t HashGenerator::lastTimestamp_ = 0;
static std::mutex idMutex;

std::string HashGenerator::encodeBase62(uint64_t id) {
    if (id == 0) return std::string(1, BASE62_ALPHABET[0]);

    std::string result;
    while (id > 0) {
        result = BASE62_ALPHABET[id % 62] + result;
        id /= 62;
    }
    return result;
}

uint64_t HashGenerator::decodeBase62(const std::string& code) {
    uint64_t result = 0;
    for (char c : code) {
        size_t idx = BASE62_ALPHABET.find(c);
        if (idx == std::string::npos) return 0;
        result = result * 62 + idx;
    }
    return result;
}

uint64_t HashGenerator::generateUniqueId(uint16_t machineId) {
    std::lock_guard<std::mutex> lock(idMutex);

    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    if (now < lastTimestamp_) {
        now = lastTimestamp_;
    }

    if (now == lastTimestamp_) {
        sequence_ = (sequence_ + 1) & 0xFFF;
        if (sequence_ == 0) {
            now = waitNextMillis(lastTimestamp_);
        }
    } else {
        sequence_ = 0;
    }

    lastTimestamp_ = now;
    uint64_t id = ((now - EPOCH) << 22)
                | (static_cast<uint64_t>(machineId) << 12)
                | sequence_;
    return id;
}

uint64_t HashGenerator::waitNextMillis(uint64_t lastTimestamp) {
    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
    while (now <= lastTimestamp) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
        now = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
    }
    return now;
}

uint32_t HashGenerator::hashString(const std::string& key) {
    // Bob Jenkins' one-at-a-time hash
    uint32_t hash = 0;
    for (char c : key) {
        hash += static_cast<unsigned char>(c);
        hash += (hash << 10);
        hash ^= (hash >> 6);
    }
    hash += (hash << 3);
    hash ^= (hash >> 11);
    hash += (hash << 15);
    return hash;
}

} // namespace urlshortener
