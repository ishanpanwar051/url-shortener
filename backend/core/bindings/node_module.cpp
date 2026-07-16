#include <napi.h>
#include "hash_generator.h"
#include "bloom_filter.h"
#include "lru_cache.h"
#include "consistent_hash.h"

using namespace urlshortener;

Napi::Value EncodeBase62(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    uint64_t id = info[0].As<Napi::Number>().Int64Value();
    return Napi::String::New(env, HashGenerator::encodeBase62(id));
}

Napi::Value DecodeBase62(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string code = info[0].As<Napi::String>().Utf8Value();
    return Napi::Number::New(env, static_cast<double>(HashGenerator::decodeBase62(code)));
}

Napi::Value GenerateUniqueId(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    uint16_t machineId = 1;
    if (info.Length() >= 1 && info[0].IsNumber()) {
        machineId = static_cast<uint16_t>(info[0].As<Napi::Number>().Int32Value());
    }
    return Napi::Number::New(env, static_cast<double>(HashGenerator::generateUniqueId(machineId)));
}

Napi::Value HashString(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string key = info[0].As<Napi::String>().Utf8Value();
    return Napi::Number::New(env, HashGenerator::hashString(key));
}

// BloomFilter wrapper class
class BloomFilterWrapper : public Napi::ObjectWrap<BloomFilterWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    BloomFilterWrapper(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    Napi::Value Insert(const Napi::CallbackInfo& info);
    Napi::Value Contains(const Napi::CallbackInfo& info);
    Napi::Value Clear(const Napi::CallbackInfo& info);
    Napi::Value BitSize(const Napi::CallbackInfo& info);
    Napi::Value HashCount(const Napi::CallbackInfo& info);

    std::unique_ptr<BloomFilter> filter_;
};

Napi::FunctionReference BloomFilterWrapper::constructor;

Napi::Object BloomFilterWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "BloomFilter", {
        InstanceMethod("insert", &BloomFilterWrapper::Insert),
        InstanceMethod("contains", &BloomFilterWrapper::Contains),
        InstanceMethod("clear", &BloomFilterWrapper::Clear),
        InstanceMethod("bitSize", &BloomFilterWrapper::BitSize),
        InstanceMethod("hashCount", &BloomFilterWrapper::HashCount),
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("BloomFilter", func);
    return exports;
}

BloomFilterWrapper::BloomFilterWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<BloomFilterWrapper>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Number expected for expectedItems").ThrowAsJavaScriptException();
        return;
    }
    size_t expectedItems = info[0].As<Napi::Number>().Int64Value();
    double fpr = 0.01;
    if (info.Length() >= 2 && info[1].IsNumber()) {
        fpr = info[1].As<Napi::Number>().DoubleValue();
    }
    filter_ = std::make_unique<BloomFilter>(expectedItems, fpr);
}

Napi::Value BloomFilterWrapper::Insert(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1 && info[0].IsString()) {
        filter_->insert(info[0].As<Napi::String>().Utf8Value());
    }
    return info.Env().Undefined();
}

Napi::Value BloomFilterWrapper::Contains(const Napi::CallbackInfo& info) {
    if (info.Length() < 1 || !info[0].IsString()) {
        return Napi::Boolean::New(info.Env(), false);
    }
    return Napi::Boolean::New(info.Env(), filter_->contains(info[0].As<Napi::String>().Utf8Value()));
}

Napi::Value BloomFilterWrapper::Clear(const Napi::CallbackInfo& info) {
    filter_->clear();
    return info.Env().Undefined();
}

Napi::Value BloomFilterWrapper::BitSize(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), static_cast<double>(filter_->bitSize()));
}

Napi::Value BloomFilterWrapper::HashCount(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), static_cast<double>(filter_->hashCount()));
}

// LRUCache wrapper
class LRUCacheWrapper : public Napi::ObjectWrap<LRUCacheWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    LRUCacheWrapper(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    Napi::Value Get(const Napi::CallbackInfo& info);
    Napi::Value Put(const Napi::CallbackInfo& info);
    Napi::Value Contains(const Napi::CallbackInfo& info);
    Napi::Value Clear(const Napi::CallbackInfo& info);
    Napi::Value Size(const Napi::CallbackInfo& info);

    std::unique_ptr<LRUCache<std::string, std::string>> cache_;
};

Napi::FunctionReference LRUCacheWrapper::constructor;

Napi::Object LRUCacheWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "LRUCache", {
        InstanceMethod("get", &LRUCacheWrapper::Get),
        InstanceMethod("put", &LRUCacheWrapper::Put),
        InstanceMethod("contains", &LRUCacheWrapper::Contains),
        InstanceMethod("clear", &LRUCacheWrapper::Clear),
        InstanceMethod("size", &LRUCacheWrapper::Size),
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("LRUCache", func);
    return exports;
}

LRUCacheWrapper::LRUCacheWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<LRUCacheWrapper>(info) {
    size_t capacity = 10000;
    if (info.Length() >= 1 && info[0].IsNumber()) {
        capacity = info[0].As<Napi::Number>().Int64Value();
    }
    cache_ = std::make_unique<LRUCache<std::string, std::string>>(capacity);
}

Napi::Value LRUCacheWrapper::Get(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        return env.Null();
    }
    std::string key = info[0].As<Napi::String>().Utf8Value();
    std::string value;
    if (cache_->get(key, value)) {
        return Napi::String::New(env, value);
    }
    return env.Null();
}

Napi::Value LRUCacheWrapper::Put(const Napi::CallbackInfo& info) {
    if (info.Length() >= 2 && info[0].IsString() && info[1].IsString()) {
        cache_->put(
            info[0].As<Napi::String>().Utf8Value(),
            info[1].As<Napi::String>().Utf8Value()
        );
    }
    return info.Env().Undefined();
}

Napi::Value LRUCacheWrapper::Contains(const Napi::CallbackInfo& info) {
    if (info.Length() < 1 || !info[0].IsString()) {
        return Napi::Boolean::New(info.Env(), false);
    }
    return Napi::Boolean::New(info.Env(), cache_->contains(info[0].As<Napi::String>().Utf8Value()));
}

Napi::Value LRUCacheWrapper::Clear(const Napi::CallbackInfo& info) {
    cache_->clear();
    return info.Env().Undefined();
}

Napi::Value LRUCacheWrapper::Size(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), static_cast<double>(cache_->size()));
}

// ConsistentHash wrapper
class ConsistentHashWrapper : public Napi::ObjectWrap<ConsistentHashWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    ConsistentHashWrapper(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    Napi::Value AddNode(const Napi::CallbackInfo& info);
    Napi::Value RemoveNode(const Napi::CallbackInfo& info);
    Napi::Value GetNode(const Napi::CallbackInfo& info);
    Napi::Value GetNodes(const Napi::CallbackInfo& info);
    Napi::Value Size(const Napi::CallbackInfo& info);

    std::unique_ptr<ConsistentHash> hash_;
};

Napi::FunctionReference ConsistentHashWrapper::constructor;

Napi::Object ConsistentHashWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "ConsistentHash", {
        InstanceMethod("addNode", &ConsistentHashWrapper::AddNode),
        InstanceMethod("removeNode", &ConsistentHashWrapper::RemoveNode),
        InstanceMethod("getNode", &ConsistentHashWrapper::GetNode),
        InstanceMethod("getNodes", &ConsistentHashWrapper::GetNodes),
        InstanceMethod("size", &ConsistentHashWrapper::Size),
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("ConsistentHash", func);
    return exports;
}

ConsistentHashWrapper::ConsistentHashWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<ConsistentHashWrapper>(info) {
    size_t virtualNodes = 150;
    if (info.Length() >= 1 && info[0].IsNumber()) {
        virtualNodes = info[0].As<Napi::Number>().Int64Value();
    }
    hash_ = std::make_unique<ConsistentHash>(virtualNodes);
}

Napi::Value ConsistentHashWrapper::AddNode(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1 && info[0].IsString()) {
        hash_->addNode(info[0].As<Napi::String>().Utf8Value());
    }
    return info.Env().Undefined();
}

Napi::Value ConsistentHashWrapper::RemoveNode(const Napi::CallbackInfo& info) {
    if (info.Length() >= 1 && info[0].IsString()) {
        hash_->removeNode(info[0].As<Napi::String>().Utf8Value());
    }
    return info.Env().Undefined();
}

Napi::Value ConsistentHashWrapper::GetNode(const Napi::CallbackInfo& info) {
    if (info.Length() < 1 || !info[0].IsString()) {
        return info.Env().Null();
    }
    return Napi::String::New(info.Env(), hash_->getNode(info[0].As<Napi::String>().Utf8Value()));
}

Napi::Value ConsistentHashWrapper::GetNodes(const Napi::CallbackInfo& info) {
    auto nodes = hash_->getNodes();
    Napi::Array result = Napi::Array::New(info.Env(), nodes.size());
    for (size_t i = 0; i < nodes.size(); ++i) {
        result.Set(i, Napi::String::New(info.Env(), nodes[i]));
    }
    return result;
}

Napi::Value ConsistentHashWrapper::Size(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), static_cast<double>(hash_->size()));
}

// Module initialization
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    exports.Set("encodeBase62", Napi::Function::New(env, EncodeBase62));
    exports.Set("decodeBase62", Napi::Function::New(env, DecodeBase62));
    exports.Set("generateUniqueId", Napi::Function::New(env, GenerateUniqueId));
    exports.Set("hashString", Napi::Function::New(env, HashString));

    BloomFilterWrapper::Init(env, exports);
    LRUCacheWrapper::Init(env, exports);
    ConsistentHashWrapper::Init(env, exports);

    return exports;
}

NODE_API_MODULE(url_shortener_core, InitAll)
